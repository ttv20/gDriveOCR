#!/usr/bin/env node
"use strict";

const {google} = require('googleapis')
const fs = require('fs')
const os = require('os')
const path = require('path')
const {range} = require('range')
const {PDFDocument} = require('pdf-lib')
const googleAuth = require('./auth')
const DocxMerger = require('docx-merger')
const program = require('commander')
const {version} = require('./package.json')
const ISO6391 = require('iso-639-1')


class gDriveOCR {

  constructor() {
    this.drive = false
    this.cFolderId = false
    this.promises = []
    this.tempsFiles = []
    this.uploadedFiles = []
    this.downloadedFiles = []
    this.openedFiles = []
    this.options = {
      file: false, lang: false, credFile: false, outputFile: false
    }
    this.status = {
      active: 0,
      total: 1,
      uploadProgress: [],
      upload: 0,
      ocr: 0,
      downloading: 0,
      finished: 0,
    }
  }

  async splitPDF(file) {
    let fileSize = fs.statSync(file)['size'] / 1000 / 1000
    // Google Drive has a limit of 10MB to convert files to Docs (and do OCR)
    // so I check if the file is too big and split it to ~5MB files
    if (fileSize > 10) {
      let pdfFile = await PDFDocument.load(fs.readFileSync(file))
      let pagesCount = pdfFile.getPageCount()
      let partSize = Math.round(5 / (fileSize / pagesCount))
      console.log(`Splitting PDF to ${Math.ceil(pagesCount / partSize)} parts`)
      this.status.total = Math.ceil(pagesCount / partSize)
      for (let startPage of range(0, pagesCount, partSize)) {
        let endPage = Math.min(startPage + partSize - 1, pagesCount)
        let newPdf = await PDFDocument.create()
        let pages = await newPdf.copyPages(pdfFile, range(startPage, endPage))
        for (let page of pages) {
          newPdf.addPage(page)
        }
        let newFilePath = path.join(os.tmpdir(), `${startPage + 1}-${endPage + 1}Pages.pdf`)
        this.tempsFiles.push(newFilePath)
        fs.writeFileSync(newFilePath, await newPdf.save())
      }
      return this.tempsFiles
    } else {
      return [file]
    }
  }

  async createTempDriveFolder() {
    try {
      console.log('Create temporary work folder in the drive')
      const res = await this.drive.files.create({
        requestBody: {
          name: 'temp_for_gdriveocr',
          mimeType: 'application/vnd.google-apps.folder'
        }
      })
      return res.data
    } catch (error) {
      console.log('Error create temp drive folder: \n', error)
      process.exit(1)
    }
  }


  async uploadFile(index, file) {
    this.status.uploadProgress[index] = 0
    this.status.upload++
    const fileSize = fs.statSync(file).size
    const fileName = path.basename(file)
    try {
      const res = await this.drive.files.create(
        {
          requestBody: {
            name: fileName,
            parents: [this.cFolderId]
          },
          media: {
            body: fs.createReadStream(file),
          },
        },
        {
          onUploadProgress: evt => {
            const progress = (evt.bytesRead / fileSize) * 100
            this.status.uploadProgress[index] = Math.round(progress)
          },
        }
      )
      this.status.upload--
      return res.data
    } catch (error) {
      console.log('Error on upload file: \n', error)
      process.exit(1)
    }
  }

  async cloudConvert(index, fileName, fileId) {
    try {
      this.status.ocr++
      let requestOptions = {
        fileId,
        requestBody: {
          mimeType: 'application/vnd.google-apps.document',
          parents: [this.cFolderId]
        },
      }
      if (this.options.lang) requestOptions.lang = this.options.lang
      const res = await this.drive.files.copy(requestOptions)
      this.status.ocr--
      return res.data
    } catch (error) {
      console.log('Error on OCR on file: \n', error)
      process.exit(1)
    }
  }

  async download(index, fileName, fileId) {
    this.status.downloading++
    const destPath = path.join(os.tmpdir(), fileName + '.docx')
    const stream = fs.createWriteStream(destPath)
    const res = await this.drive.files.export({
      fileId,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }, {
      responseType: 'stream'
    })
    await new Promise((resolve, reject) => {
      let customReject = (err) => {
        console.log('Error on OCR on file: \n', error)
        process.exit(1)
        reject(err)
      }
      res.data
        .on('error', customReject)
        .pipe(stream)
        .on('error', customReject)
        .on('finish', resolve);
    })
    this.status.downloading--
    this.status.finished++
    return path.join(os.tmpdir(), fileName + '.docx')
  }

  async mergeDocx(files) {
    for (let file of files) {
      this.openedFiles.push(fs
        .readFileSync(path.resolve(__dirname, file), 'binary'))
    }
    await new Promise((resolve, reject) => {
      let docFile = new DocxMerger({}, this.openedFiles)
      docFile.save('nodebuffer', function (data) {
        fs.promises.writeFile(this.options.outputFile, data, function (err) {
          reject(err)
        }).then(resolve)
      })
    })
  }

  statusPrinter() {
    const arrAvg = arr => arr.reduce((a, b) => a + b, 0) / arr.length
    let uploadProgress = Math.round(arrAvg(this.status.uploadProgress))
    let status = ''
    status += `\rProcessing ${this.status.active} of ${this.status.total}.`
    status += ` ${this.status.upload} in upload, ${uploadProgress}% uploaded.`
    status += ` ${this.status.ocr} converting, ${this.status.downloading} downloading, ${this.status.finished} finished`
    process.stdout.write(status)
  }

  async processPart(index, file) {
    // let only 10 run at once, else the API return 500 sometimes
    while (this.status.active >= 10) {
      await new Promise((resolve) => {
        setTimeout(() => resolve(), 500)
      })
    }
    this.status.active++
    let uploadedFile = await this.uploadFile(index, file)
    this.uploadedFiles.push(uploadedFile)
    let converted = await this.cloudConvert(index, path.basename(file), uploadedFile.id)
    let downloadedFile = await this.download(index, path.basename(file, '.pdf'), converted.id)
    this.status.active--
    return downloadedFile
  }

  async gDriveOCR() {
    let oAuth2Client = await googleAuth(this.options.credFile, this.options.tokenFile)
    this.drive = await google.drive({
      version: 'v3',
      auth: oAuth2Client
    })

    this.cFolderId = (await this.createTempDriveFolder()).id

    let files = await this.splitPDF(this.options.file)

    for (const i in files) {
      this.promises.push(this.processPart(i, files[i]))
    }
    console.log(`Processing ${files.length} files...`)
    let statusInterval = setInterval(()=>{this.statusPrinter.call(this)}, 500)
    let downloadedFiles = await Promise.all(this.promises)
    clearInterval(statusInterval)
    process.stdout.write('\rAll the files ready. merging the files, it may take few minutes...\n')

    if (downloadedFiles.length === 1) {
      await fs.promises.copyFile(downloadedFiles[0], this.options.outputFile)
    } else {
      await this.mergeDocx(downloadedFiles)
    }
    console.log('Done. saved in '+this.options.outputFile)

    await this.exitCleanup()
  }

  async exitCleanup() {
    console.log('\nCleanup and exit...')
    try {
      for (let file of this.openedFiles) file.close()
      for (let file of this.tempsFiles) fs.unlinkSync(file)
      for (let file of this.downloadedFiles) fs.unlinkSync(file)
    } catch (error) {
      exit()
    }
    try {
      await this.drive.files.delete({
        fileId: this.cFolderId
      })
    } catch (error) {
      console.log("error on delete the cloud folder, maybe it didn't created yet, delete it yourself")
      process.exit(1)
    }
    exit()
  }
}

let exit = process.exit

process.stdin.resume()

function fileExists(f){
  if(fs.existsSync(f)){
    return f
  }else{
    console.error(`${f} doesn't exists`)
    exit()
  }
}

if (require.main === module) {
  process.env.UV_THREADPOOL_SIZE = 32
  let Obj = new gDriveOCR()
  program
    .arguments('<file>')
    .action((f)=>{Obj.options.file = fileExists(f)})
    .description('OCR by Google Drive API\n' +
      '\n' +
      '*** NOTE **\n' +
      'If it is your first use, you need credentials file to authorize use your Google Account\n' +
      'Go to https://www.npmjs.com/package/gdriveocr to learn how to get one\n' +
      'Else you probably have a token file with authorization to your Google Account')
    .version(version)
    .option('-c, --cred <cred>', 'Google API cred file path', './credentials.json')
    .option('-t, --token <token>', 'Google API token file path', './token.json')
    .option('-o, --output-file <outputFile>', 'path to the output docx file', './output.docx')
    .option('-l, --lang <lang>', '2 digit language language hint for the OCR (if not specified, Google recognized it alone)')
    .option('-g, --lang-list', 'print all the languages code')
    .parse(process.argv)

  if(program.langList){
    let list = ISO6391.getLanguages(ISO6391.getAllCodes())
    let listStr = ''
    for(let lang of list){
      listStr += `${lang.code} - ${lang.name} (${lang.nativeName})\n`
    }
    console.log(listStr)
    exit()
  }else if(!Obj.options.file){
    console.error('file not provided')
    exit()
  }else{
    if(program.lang) {
      if(!ISO6391.validate(program.lang)){
        console.error('Language not recognize.')
        console.error('To print the languages use `gDriveOCR --lang-list`.')
        exit()
      }
      Obj.options.lang = program.lang
    }
    Obj.options.credFile = fileExists(program.cred)
    Obj.options.tokenFile = program.token
    Obj.options.outputFile = program.outputFile

    process.on('SIGINT', async ()=>{await Obj.exitCleanup.call(Obj)})
    process.on('SIGUSR1', async ()=>{await Obj.exitCleanup.call(Obj)})
    process.on('SIGUSR2', async ()=>{await Obj.exitCleanup.call(Obj)})
    // process.on('unhandledRejection', async (reason, promise) => {
    //   await Obj.exitCleanup()
    // })

    try{
      Obj.gDriveOCR()
    } catch (e) {
      console.error('unexpected error', e)
      Obj.exitCleanup.call(Obj)
    }

  }
} else {
  console.log('required as a module');
}

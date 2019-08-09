#!/usr/bin/env node

const {google} = require('googleapis')
const fs = require('fs')
const os = require('os')
const path = require('path')
const {range} = require('range')
const {PDFDocument} = require('pdf-lib')
const googleAuth = require('./auth')
const DocxMerger = require('docx-merger');
const program = require('commander');


let drive, cloudFolderId, file, lang
let promises = []
let tempsFiles = []
let uploadedFiles = []
let downloadedFiles = []
let openedFiles = []
let certfile = 'credentials.json'
let status = {
  uploadProgress: [],
  ocr: [],
  download: [],
  finished: [],
}
// Promise.config({ cancellation: true })


let exit = ()=>process.exit()

async function splitPDF(file){
  console.log('Open PDF...')
  let pdfFile = await PDFDocument.load(fs.readFileSync(file))
  let pagesCount = pdfFile.getPageCount()
  if(pagesCount > 25){
    console.log('Splitting PDF...')
    for(let startPage of range(0, pagesCount, 25)){
      endPage = startPage+24 > pagesCount ? pagesCount : startPage+24
      let newPdf = await PDFDocument.create()
      let pages = await newPdf.copyPages(pdfFile, range(startPage, endPage))
      for(let page of pages){
        newPdf.addPage(page)
      }
      let newFilePath = path.join(os.tmpdir(),`${startPage+1}-${endPage+1}Pages.pdf`)
      tempsFiles.push(newFilePath)
      fs.writeFileSync(newFilePath, await newPdf.save())
    }
    return tempsFiles
  }else{
    return [file]
  }
}

async function getDriveService(oAuth2Client){
  const drive = google.drive({
    version: 'v3',
    auth: oAuth2Client
  });
  return drive
}

async function createTempDriveFolder(){
  try{
    const res = await drive.files.create({
      requestBody: {
        name: 'temp_for_readit',
        mimeType: 'application/vnd.google-apps.folder'
      }
    });
    console.log('Temp drive folder created')
    return res.data
  } catch (error){
    console.log('Error create temp drive folder: \n', error)
    process.exit(1)
  }
}

async function uploadFile(index, file) {
  status.uploadProgress[index] = 0
  const fileSize = fs.statSync(file).size;
  const fileName = path.basename(file)
  try{
    const res = await drive.files.create(
      {
        requestBody: {
          name: path.basename(file),
          parents: [cloudFolderId]
        },
        media: {
          body: fs.createReadStream(file),
        },
      },
      {
        // Use the `onUploadProgress` event from Axios to track the
        // number of bytes uploaded to this point.
        onUploadProgress: evt => {
          const progress = (evt.bytesRead / fileSize) * 100
          status.uploadProgress[index] = Math.round(progress)
          if(Math.round(progress) == 100){
            status.uploadProgress[index] = null
          }
        },
      }
    );
    status.uploadProgress[index] = null
    return res.data;
  } catch (error){
    console.log('Error on upload file: \n', error)
    process.exit(1)
  }
}

async function cloudConvert(index, fileName, fileId){
  try{
    status.ocr[index] = 1
    let options = {
      fileId,
      requestBody: {
        mimeType: 'application/vnd.google-apps.document',
        parents: [cloudFolderId]
      },
    }
    if(lang) options.ocrLanguage = lang
    const res = await drive.files.copy(options)
    status.ocr[index] = 0
    return res.data
  } catch (error){
    console.log('Error on OCR on file: \n', error)
    process.exit(1)
  }
}

async function download(index, fileName, fileId){
  status.download[index] = 1
  const destPath = path.join(os.tmpdir(), fileName+'.docx')
  const stream = fs.createWriteStream(destPath);
  const res = await drive.files.export({
    fileId,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }, {
    responseType: 'stream'
  })
  res.data.pipe(stream)
  await new Promise((resolve, reject) => {
      stream
        .on('finish', () => resolve())
        .on('error', err => {
          console.log('Error on OCR on file: \n', error)
          process.exit(1)
          reject(err)
        })
    });
  status.download[index] = 0
  status.finished[index] = 1
  return path.join(os.tmpdir(), drive+'.docx')
}

async function processPart(index, file){
  let uploadedFile = await uploadFile(index, file)
  uploadedFiles.push(uploadedFile)
  let converted = await cloudConvert(index, path.basename(file), uploadedFile.id)
  return await download(index, path.basename(file, '.pdf'), converted.id)
}

function statusPrinter(){
  const arrAvg = arr => arr.reduce((a,b) => a + b, 0) / arr.length
  const arrSum = arr => arr.reduce((a,b) => a + b, 0)
  let uploadProgress = arrAvg(status.uploadProgress)
  let ocr = arrSum(status.ocr)
  let download = arrSum(status.download)
  let finished = arrSum(status.finished)
  process.stdout.write(`\r${Math.round(uploadProgress)}% uploaded, ${ocr} on OCR, ${download} download, ${finished} finished`)
}

let run = async ()=>{
  let oAuth2Client = await googleAuth(certfile)
  drive = await getDriveService(oAuth2Client)
  const cloudFolder = await createTempDriveFolder(drive)
  cloudFolderId = cloudFolder.id

  let files = await splitPDF('book.pdf')

  for(const item in status){
    status[item] = Array(files.length).fill(0)
  }
  for(const i in files){
    promises.push(processPart(i, files[i]))
  }
  console.log(`Processing ${files.length} files...`)
  let statusInterval = setInterval(statusPrinter, 500)
  let downloadedFiles = await Promise.all(promises)
  clearInterval(statusInterval)
  console.log('All the files ready. merging the files, it may take few minutes...')

  for(let file of downloadedFiles){
    openedFiles.push(fs
    .readFileSync(path.resolve(__dirname, file), 'binary'))
  }
  var docx = new DocxMerger({},openedFiles);
  docx.save('nodebuffer',function (data) {
      fs.writeFile("output.docx", data, function(err){
      });
  });
  console.log('Done. saved as output.docx')
  exitCleanup()
}

program
  .arguments('<file>')
  .action((f)=>{
    if(fs.existsSync(f)){
      file = f
    }else{
      console.error(`${f} doesn't exists`)
      exit()
    }
  })
  .description('OCR with Google Drive API')
  .version('0.1.0')
  .option('-l, --lang <lang>', '2 digit language for OCR')
  .option('-c, --cert <cert>', 'Google API cert file path', './credentials.json')
  .parse(process.argv);

if(!file){
  console.error('file not provided')
  exit()
}else{
  if(program.lang) lang  = program.lang
  if(program.cert) certpath = program.cert
  run()
}

process.stdin.resume()

async function exitCleanup() {
  console.log('cleanup and exit...')
  try{
    for(file of openedFiles) file.close()
    for(file of tempsFiles) fs.unlinkSync(file)
    for(file of downloadedFiles) fs.unlinkSync(file)
  } catch(error){
    exit()
  }
  try{
    await drive.files.delete({
      fileId: cloudFolderId
    });
  } catch (error){
    console.log("error on delete the cloud folder, maybe it didn't created yet, delete it yourself")
    process.exit(1)
  }
  exit()
}

process.on('SIGINT', exitCleanup)
process.on('SIGUSR1', exitCleanup)
process.on('SIGUSR2', exitCleanup)
process.on('unhandledRejection', async (reason, promise)=>{
  console.error('unexpected error', reason, promise)
  await exitCleanup()
})

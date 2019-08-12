
# gDriveOCR
  <a href="https://www.npmjs.com/package/gdriveocr"><img src="https://img.shields.io/npm/v/gdriveocr.svg" alt="Version"></a>
  <a href="https://www.npmjs.com/package/gdriveocr"><img src="https://img.shields.io/npm/l/gdriveocr.svg" alt="License"></a>

Node CLI program for OCR large PDF documents

## Purpose
Let you OCR (extract text from image) from PDF by Google Drive API

## Table of Contents

  1. [Installation](#installation)
  2. [How to get credentials file](#how-to-get-credentials-file)
  3. [Usage](#usage)
  5. [TODO](#todo)
  
### installation
  ```bash
  # npm install -g gdriveocr
  ```

### How to get credentials file
to use this program you need to enable the Drive API on your Google account:
* Go to [Google Drive API](https://developers.google.com/drive/api/v3/quickstart/nodejs)
* Click on 'ENABLE THE DRIVE API'
* Download the cert file by clicking on 'DOWNLOAD CLIENT CONFIGURATION'

### Usage
  ```
  Usage: gdriveocr [options] <file>
  
  OCR by Google Drive API
  
  Options:
    -V, --version      output the version number
    -l, --lang <lang>  2 digit language language hint for the OCR (if not specifid Google recognized alone)
    -c, --cert <cert>  Google API cert file path (default: "./credentials.json")
    -h, --help         output usage information
  ```

### TODO
* support multiple files and images
* better error handling

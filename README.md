# gDriveOCR
Node CLI program for OCR large PDF documents

## Purpose
Google Drive API has a limit of 10mb convert files to Google Doc (and do OCR)
this program let you pass that

## Table of Contents

  1. [Installation](#installation)
  1. [Usage](#usage)
  1. [TODO](#todo)
  
### installation
  ```bash
  npm install gdriveocr
  ```
  
### Usage Nodejs
  ```
  Usage: index [options] <file>
  
  OCR with Google Drive API
  
  Options:
    -V, --version      output the version number
    -l, --lang <lang>  2 digit language for OCR
    -c, --cert <cert>  Google API cert file path (default: "./credentials.json")
    -h, --help         output usage information
  ```
  
### TODO
...

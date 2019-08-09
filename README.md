# gDriveOCR
Node CLI program for OCR large PDF documents

## Purpose
Let you OCR (extract text from image) from PDF by Google Drive API

## Table of Contents

  1. [Installation](#installation)
  1. [Usage](#usage)
  1. [TODO](#todo)
  
### installation
  ```bash
  # npm install gdriveocr
  ```
  
### Usage Nodejs
  ```
  Usage: gdriveocr [options] <file>
  
  OCR by Google Drive API
  
  Options:
    -V, --version      output the version number
    -l, --lang <lang>  2 digit language for OCR
    -c, --cert <cert>  Google API cert file path (default: "./credentials.json")
    -h, --help         output usage information
  ```
  
### TODO
* add explain about google api cert file
* support multiple files and images

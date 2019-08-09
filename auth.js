const fs = require('fs');
const reader = require('readline-sync');
const {google} = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/drive'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
async function authorize(credentials, callback) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  try{
    token = fs.readFileSync(TOKEN_PATH)
    oAuth2Client.setCredentials(JSON.parse(token))
    return oAuth2Client
  } catch (error){
    await getNewToken(oAuth2Client)
    return oAuth2Client
  }
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
async function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  let code = reader.question('Enter the code from that page here: ')
  console.log(code)
  try{
    const {tokens} = await oAuth2Client.getToken(code)
    oAuth2Client.setCredentials(tokens)
    fs.writeFile(TOKEN_PATH, JSON.stringify(tokens), (err) => {
      if (err) console.error(err);
      console.log('Token stored to', TOKEN_PATH);
    });
    return oAuth2Client
  } catch (error){
    console.error('Error: unable to get token:', error)
    process.exit()
  }
}

// /**
//  * Prints the title of a sample doc:
//  * https://docs.google.com/document/d/195j9eDD3ccgjQRttHhJPymLJUCOUjs-jmwTrekvdjFE/edit
//  * @param {google.auth.OAuth2} auth The authenticated Google OAuth 2.0 client.
//  */
// function printDocTitle(auth) {
//   const docs = google.docs({version: 'v1', auth});
//   docs.documents.get({
//     documentId: '195j9eDD3ccgjQRttHhJPymLJUCOUjs-jmwTrekvdjFE',
//   }, (err, res) => {
//     if (err) return console.log('The API returned an error: ' + err);
//     console.log(`The title of the document is: ${res.data.title}`);
//   });
// }

async function auth(certfile){
  try{
    let content = fs.readFileSync(certfile)
    return await authorize(JSON.parse(content))
  } catch (error){
    console.error('Error loading client secret file:', error)
    process.exit(1)
  }
}

module.exports = auth

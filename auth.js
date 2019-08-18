const fs = require('fs');
const reader = require('readline-sync');
const {google} = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/drive'];

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {String} tokenPath path for token file.
 * @param {function} callback The callback to call with the authorized client.
 */
async function authorize(credentials, tokenPath, callback) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  try {
    let token = fs.readFileSync(tokenPath)
    oAuth2Client.setCredentials(JSON.parse(token))
    return oAuth2Client
  } catch (error) {
    await getNewToken(oAuth2Client, tokenPath)
    return oAuth2Client
  }
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {String} tokenPath path for token file.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
async function getNewToken(oAuth2Client, tokenPath) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  let code = reader.question('Enter the code from that page here: ')
  console.log(code)
  try {
    const {tokens} = await oAuth2Client.getToken(code)
    oAuth2Client.setCredentials(tokens)
    fs.writeFile(tokenPath, JSON.stringify(tokens), (err) => {
      if (err) console.error(err);
      console.log('Token stored to', TOKEN_PATH);
    });
    return oAuth2Client
  } catch (error) {
    console.error('Error: unable to get token:', error)
    process.exit()
  }
}

async function auth(credFile, tokenPath) {
  try {
    let content = fs.readFileSync(credFile)
    return await authorize(JSON.parse(content), tokenPath)
  } catch (error) {
    console.error('Error loading client secret file:', error)
    process.exit(1)
  }
}

module.exports = auth

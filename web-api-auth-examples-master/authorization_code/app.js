/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
const MongoClient = require('mongodb').MongoClient;
var db;
var userName; //Spotify username
var id; //Spotify user ID
var mongodb_mlab = 'mongodb://tinnilarh:$&8*@ds017636.mlab.com:17636/user-playlist';

var client_id = 'd9c1a61340f743abaaf1ca806d12dee6'; // Your client id
var client_secret = ''; // Your secret
var redirect_uri = 'http://localhost:8888/callback'; // Your redirect uri

/** get day of the week **/
var now = new Date();

var date = now.getDate();
var month = now.getMonth()+1;
var year = now.getFullYear();
var today = year+'-'+month+'-'+date; //today's date in yyyy-mm-dd

(function(){
  var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  Date.prototype.getDayName = function(){
    return days[this.getDay()];
  };
})();


/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';
var app = express();

app.use(express.static(__dirname + '/public'))
   .use(cookieParser());

//get access token
app.get('/access', function(req, res) {
var userID = req.query.userId;
var playlistID = req.query.playlistId;


var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      form: {
        grant_type: 'client_credentials'
      },
      json: true
    };

    

//use access token to access Spotify Web API finding playlists
request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {
        var token = body.access_token;
        var options = {
          url: 'https://api.spotify.com/v1/users/' +  userID + '/playlists/'+ playlistID,
          headers: {
              'Authorization': 'Bearer ' + token
          },
          json: true
        };
      
       request.get(options, function(error, response, body){
        res.send(body); 
        // console.log(body);
       });
        
    }
});

});

//get user's authorization
app.get('/login', function(req, res) { 

  var state = generateRandomString(16);
  res.cookie(stateKey, state);
  var scope = 'user-read-private user-read-email';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));

});
        





app.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    //get access and refresh tokens, accessing user's info now
    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token,
            refresh_token = body.refresh_token;

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {
          console.log(body);
          username = body.display_name;
          id = body.id;

    });

        // we can also pass the token to the browser to make requests from there
          res.redirect('/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          })); 
  }

  else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
         
        }));

        
      }
});

}
});

/** database **/

app.get('/post', function(req, res){
  var userID = req.query.userId;
  var playlistID = req.query.playlistId;
  var playlistName = req.query.playlistName;

  // if there is already a playlist for today, alert
  db.collection('dailyPlaylist').findOne({SpotifyUserID: id, date: today}, function(err, result){
    if (result){
      res.send(result.playlistName); 
    }
    else{ //if no playlist entry from this user for today
      //not sure if day is necessary
        db.collection('dailyPlaylist').save({ "SpotifyUsername": username, 
                                            "SpotifyUserID": id, 
                                            "playlistID": playlistID, 
                                            "playlistUser": userID,
                                            "playlistName": playlistName,
                                            "date": today,
                                            "day": now.getDayName()},function(err, result){
        if (err){
          return console.log(err);
        }

        console.log('saved the playlist: '+ playlistID +' by the user: '+ userID +' to database');
        res.send("null");
      });
    }
  });
});

app.get('/update', function(req, res){
  var userID = req.query.userId;
  var playlistID = req.query.playlistId;
  var playlistName = req.query.playlistName;

  db.collection('dailyPlaylist').findOneAndUpdate({
    SpotifyUserID: id, date: today}, {
      $set: {
        playlistID: playlistID,
        playlistUser: userID,
        playlistName: playlistName
      }
    }, function(err, result){
      if(err) return res.send(err);
      res.send(result);
    });
  
  });

app.get('/get', function(req, res){
  var user = req.query.userName;
  var id = req.query.userid;

  db.collection('dailyPlaylist').find({
    SpotifyUsername: user, 
    SpotifyUserID: id
  }).toArray(function(err, result){//.toArray(
    if(err) return console.log(err);
     
      res.send(result);
    
  }); //);
});

MongoClient.connect(mongodb_mlab, function(err,database){
  if (err){
    return console.log(err);
  }

  db = database;
  app.listen(8888, function(){
    console.log('Listening on 8888');
  });
});

// app.get('/refresh_token', function(req, res) {

//   // requesting access token from refresh token
//   var refresh_token = req.query.refresh_token;
//   var authOptions = {
//     url: 'https://accounts.spotify.com/api/token',
//     headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
//     form: {
//       grant_type: 'refresh_token',
//       refresh_token: refresh_token
//     },
//     json: true
//   };

//   request.post(authOptions, function(error, response, body) {
//     if (!error && response.statusCode === 200) {
//       var access_token = body.access_token;
//       res.send({
//         'access_token': access_token
//       });
//     }
//   });
// });

// }
// });






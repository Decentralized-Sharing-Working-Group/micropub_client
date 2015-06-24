var express = require('express'), 
 path = require('path'),
 http = require('http'), 
 htmlparser = require("htmlparser2");
 request = require('request'),
 bodyParser = require('body-parser');

var port = process.env.PORT || 8080,
 host = process.env.HOST || "127.0.0.1", 
 serverAddress = 'http://' + host + ':' + port;
var authorizationEndpoint;
var app = express();
app.set('view engine', 'jade');
app.use(bodyParser.urlencoded({     
	extended: true
})); 


var parser = new htmlparser.Parser({
	onopentag: function(name, attribs){
        if(name === "link" && attribs.rel === "authorization_endpoint") {
            authorizationEndpoint = attribs.href;
            console.log('authorization endpoint : ' + authorizationEndpoint);
        }
    },
}, {decodeEntities: true});


app.get('/', function(req, res) {
	res.render('index');
});

app.get('/auth', function(req, res) {
	var url = req.query.me;
	console.log('url : ' + url);
	request(url, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			parser.write(body);
			parser.end();
			if(authorizationEndpoint) {
				var params = '?me=' + url + 
								'&client_id='+ serverAddress + 
								'&redirect_uri=' + serverAddress + '/callback_indieauth' +
								'&response_type=code' + 
								'&scope=post';
				res.redirect(authorizationEndpoint + params);
			}
			else
				res.render('index', {error: 'Error'});
		}
		else {
			res.render('index', {error: 'Error'});
		}
	});
});

app.get('/callback_indieauth', function(req, res) {
	console.log('redirect ok from ' + req.originalUrl);

	request.post({
		url: authorizationEndpoint,
		form: {
			code: req.query.code,
		  	redirect_uri: serverAddress + '/callback_indieauth',
		  	client_id: serverAddress,
		}},
		function(err, response, body) {
			if (!err && response.statusCode == 200) {
				console.log('server response : ' + body);
				res.render('callback', {auth: true});
			}
			else {
				console.log('error : ' + err);
				console.log('server response : ' + body);
				res.render('callback', {auth: false});
			}
		}
	);
	
});


var server = http.createServer(app).listen(port, host, function() {
  console.log("Server listening to %s:%d within %s environment",
              host, port, app.get('env'));

});
var express = require('express'), 
 path = require('path'),
 http = require('http'), 
 querystring = require('querystring'),
 htmlparser = require("htmlparser2");
 request = require('request'),
 FormUrlencoded = require('form-urlencoded'),
 bodyParser = require('body-parser'), 
 fs = require('fs'), 
 formidable = require('formidable');

var port = process.env.PORT || 8080,
 host = process.env.HOST || "127.0.0.1", 
 serverAddress = 'http://' + host + ':' + port;

var params = {
	
	me: null,
	redirect_uri: serverAddress + '/callback_indieauth',
	client_id: serverAddress,
	scope: 'post',
	response_type: 'code',
	state: '123456',
	code: null,
	token: null
};

var endpoints = {
	authorizationEndpoint: null, 
	micropubEndpoint: null,
	tokenEndpoint: null
};

var app = express();
app.set('view engine', 'jade');
app.use(bodyParser.urlencoded({     
	extended: true
})); 

/* Endpoint discovery */
var parser = new htmlparser.Parser({
	onopentag: function(name, attribs){
        if(name === "link" && attribs.rel === "authorization_endpoint") {
            endpoints.authorizationEndpoint = attribs.href;
        }
        else if(name === "link" && attribs.rel === "micropub") {
        	endpoints.micropubEndpoint = attribs.href;
        }
        else if(name === "link" && attribs.rel === "token_endpoint") {
        	endpoints.tokenEndpoint = attribs.href;
        }
    },
}, {decodeEntities: true});


app.get('/', function(req, res) {

	res.render('index');
});

//for testing only
app.post('/', function(req, res) {
	console.log('content-type : ' + req.headers['content-type']);
	if(req.headers['content-type'].indexOf("multipart/form-data") > -1)
		console.log("win");

	form = new formidable.IncomingForm();
	form.parse(req, function(err, fields, files) {
		console.log('files : ' + JSON.stringify(files));
		console.log('fields : ' + JSON.stringify(files));
		stream = fs.createReadStream(files['photo'].path);
		
		console.log('image : ' + files['photo'].path);
	});
});
app.get('/test', function(req, res) {

	res.render('sender', {status: 'test'});
});


/* Queries the authorization endpoint */
app.get('/auth', function(req, res) {
	var url = req.query.me;
	console.log('url : ' + url);
	request(url, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			parser.write(body);
			parser.end();
			if(endpoints.authorizationEndpoint) {
				params.me = url;
				var p = '?me=' + params.me + 
						'&client_id='+ params.client_id + 
						'&redirect_uri=' + params.redirect_uri +
						'&response_type=' + params.response_type +  
						'&state=' + params.state + 
						'&scope=' + params.scope;
				res.redirect(endpoints.authorizationEndpoint + p);
			}
			else
				res.render('index', {error: 'Error'});
		}
		else {
			res.render('index', {error: 'Error'});
		}
	});
});

/* The authorization endpoint redirects here */
app.get('/callback_indieauth', function(req, res) {
	console.log('redirect ok from ' + req.originalUrl);

	params.code = req.query.code;
	var reqParams = {
		code: params.code,
	  	redirect_uri: params.redirect_uri ,
	  	client_id: params.client_id,
	  	state: params.state
	  };

	postRequest(endpoints.authorizationEndpoint, reqParams, null, false, function(code, body) {
		if(code === 200) {
			getToken(endpoints.tokenEndpoint, params, function(token) {
				params.token = token;
				console.log('token : ' + token);
			});
			res.render('sender', {status: 'Authentication successful'});
		}
		else {
			res.render('sender', {status: 'Authentication failed'});
		}
	});


	/*request.post({
		url: endpoints.authorizationEndpoint,
		form: {
			code: params.code,
		  	redirect_uri: params.redirect_uri ,
		  	client_id: params.client_id,
		  	state: params.state
		}},
		function(err, response, body) {
			if (!err && response.statusCode == 200) {
				console.log('server response : ' + body);
				getToken(endpoints.tokenEndpoint, params, function(token) {
					params.token = token;
					console.log('token : ' + token);
				});
				res.render('sender', {status: 'Authentication successful'});
				
			}
			else {
				console.log('server response : ' + body);
				res.render('sender', {status: 'Authentication failed'});
			}
		}
	);*/
});

/* Micropub route */
app.post('/send', function(req, res) {

	var reqParams, multipart = false;

	/* Note request */
	if(req.body.note) {
		console.log('note : ' + req.body.note);
		reqParams = {
			h: 'entry',
			content: req.body.note
		};
	}
	/* Image request */
	else if(req.headers['content-type'].indexOf("multipart/form-data") > -1) {
		form = new formidable.IncomingForm();
		form.parse(req, function(err, fields, files) {
			stream = fs.createReadStream(files['photo'].path);
			reqParams = {
				h: 'entry',
				content: files['photo'].path,
				photo: stream
			};
			multipart = true;
		});
	}
	else {
		console.log('error');
		res.render('sender', {status: 'Sending failure'});
	}

	
	var header = {Authorization: 'Bearer ' + params.token};
	/* !! FIXME : reqParams null when multipart !! */
	console.log('params : ' + reqParams);

	postRequest(endpoints.micropubEndpoint, reqParams, header, multipart, function(code, body) {
		if(code === 302) {
			console.log('Data sent');
			res.render('sender', {status: 'Note sent'});
		}
		else {
			console.log('body : ' + body);
			res.render('sender', {status: 'Sending failure'});
		}
	});
/*
	request.post({
		url: endpoints.micropubEndpoint,
		form: {
			h: 'entry',
			content: req.body.note
		},
		headers: {
    		'Authorization': 'Bearer ' + params.token
  		}
		}, function(err, response, body) {
			if (!err && response.statusCode == 302) {
				res.render('sender', {status: 'Note sent'});
			}
			else {
				console.log('code : ' + response.statusCode);
				console.log('response : ' + JSON.stringify(response));
				res.render('sender', {status: 'Sending failure'});
			}
		}
	);*/

});


var getToken = function(endpoint, parameters, callback) {

	request.post({
		url: endpoint,
		form: {
			me: params.me,
			code: params.code,
			redirect_uri: params.redirect_uri,
			client_id: params.client_id,
			state: params.state,
			scope: params.scope
		}}, 
		function(err, response, body) {
			var parse = querystring.parse(body);
			var token = parse['access_token'];
			callback(token);
		}
	);
};

var postRequest = function(endpoint, formValues, headers, multipart, callback) {

	if(!multipart) {
		request.post({
			url: endpoint,
			form: formValues,
			headers: headers
			}, function(err, response, body) {
				console.log('response : ' + JSON.stringify(response));
				callback(response.statusCode, body);
			}
		);
	}
	else {
		request.post({
			url: endpoint,
			formData: formValues,
			headers: headers
			}, function(err, response, body) {
				console.log('response : ' + JSON.stringify(response));
				callback(response.statusCode, body);
			}
		);
	}
}


var server = http.createServer(app).listen(port, host, function() {
  console.log("Server listening to %s:%d within %s environment",
              host, port, app.get('env'));

});
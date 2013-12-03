//
// GOOGLE API
//
(function(hello, window){

	"use strict";

	function int(s){
		return parseInt(s,10);
	}

	// Format
	// Ensure each record contains a name, id etc.
	function formatItem(o){
		if(o.error){
			return;
		}
		if(!o.name){
			o.name = o.title || o.message;
		}
		if(!o.picture){
			o.picture = o.thumbnailLink;
		}
		if(!o.thumbnail){
			o.thumbnail = o.thumbnailLink;
		}
		if(o.mimeType === "application/vnd.google-apps.folder"){
			o.type = "folder";
			o.files = "https://www.googleapis.com/drive/v2/files?q=%22"+o.id+"%22+in+parents";
		}
	}

	// Google has a horrible JSON API
	function gEntry(o){
		paging(o);

		var entry = function(a){

			var media = a['media$group']['media$content'].length ? a['media$group']['media$content'][0] : {};
			var i=0, _a;
			var p = {
				id		: a.id.$t,
				name	: a.title.$t,
				description	: a.summary.$t,
				updated_time : a.updated.$t,
				created_time : a.published.$t,
				picture : media ? media.url : null,
				thumbnail : media ? media.url : null,
				width : media.width,
				height : media.height
//				original : a
			};
			// Get feed/children
			if("link" in a){
				for(i=0;i<a.link.length;i++){
					var d = a.link[i];
					if(d.rel.match(/\#feed$/)){
						p.upload_location = p.files = p.photos = d.href;
						break;
					}
				}
			}

			// Get images of different scales
			if('category' in a&&a['category'].length){
				_a  = a['category'];
				for(i=0;i<_a.length;i++){
					if(_a[i].scheme&&_a[i].scheme.match(/\#kind$/)){
						p.type = _a[i].term.replace(/^.*?\#/,'');
					}
				}
			}

			// Get images of different scales
			if('media$thumbnail' in a['media$group'] && a['media$group']['media$thumbnail'].length){
				_a = a['media$group']['media$thumbnail'];
				p.thumbnail = a['media$group']['media$thumbnail'][0].url;
				p.images = [];
				for(i=0;i<_a.length;i++){
					p.images.push({
						source : _a[i].url,
						width : _a[i].width,
						height : _a[i].height
					});
				}
				_a = a['media$group']['media$content'].length ? a['media$group']['media$content'][0] : null;
				if(_a){
					p.images.push({
						source : _a.url,
						width : _a.width,
						height : _a.height
					});
				}
			}
			return p;
		};

		var r = [];
		if("feed" in o && "entry" in o.feed){
			for(i=0;i<o.feed.entry.length;i++){
				r.push(entry(o.feed.entry[i]));
			}
			o.data = r;
			delete o.feed;
		}

		// Old style, picasa, etc...
		else if( "entry" in o ){
			return entry(o.entry);
		}
		// New Style, Google Drive & Plus
		else if( "items" in o ){
			for(var i=0;i<o.items.length;i++){
				formatItem( o.items[i] );
			}
			o.data = o.items;
			delete o.items;
		}
		else{
			formatItem( o );
		}
		return o;
	}

	function formatFriends(o){
		paging(o);
		var r = [];
		if("feed" in o && "entry" in o.feed){
			var token = hello.getAuthResponse('google').access_token;
			for(var i=0;i<o.feed.entry.length;i++){
				var a = o.feed.entry[i],
					pic = (a.link&&a.link.length>0)?a.link[0].href+'?access_token='+token:null;

				r.push({
					id		: a.id.$t,
					name	: a.title.$t,
					email	: (a.gd$email&&a.gd$email.length>0)?a.gd$email[0].address:null,
					updated_time : a.updated.$t,
					picture : pic,
					thumbnail : pic
				});
			}
			o.data = r;
			delete o.feed;
		}
		return o;
	}


	//
	// Paging
	function paging(res){

		// Contacts V2
		if("feed" in res && res.feed['openSearch$itemsPerPage']){
			var limit = int(res.feed['openSearch$itemsPerPage']['$t']),
				start = int(res.feed['openSearch$startIndex']['$t']),
				total = int(res.feed['openSearch$totalResults']['$t']);

			if((start+limit)<total){
				res['paging'] = {
					next : '?start='+(start+limit)
				};
			}
		}
		else if ("nextPageToken" in res){
			res['paging'] = {
				next : "?pageToken="+res['nextPageToken']
			};
		}
	}

	//
	// Misc
	var utils = hello.utils;


	// Multipart
	// Construct a multipart message

	function Multipart(){
		// Internal body
		var body = [],
			boundary = (Math.random()*1e10).toString(32),
			counter = 0,
			line_break = "\r\n",
			delim = line_break + "--" + boundary,
			ready = function(){};

		// Add File
		function addFile(item){
			var fr = new FileReader();
			fr.onload = function(e){
				//addContent( e.target.result, item.type );
				addContent( btoa(e.target.result), item.type + line_break + "Content-Transfer-Encoding: base64");
			};
			fr.readAsBinaryString(item);
		}

		// Add content
		function addContent(content, type){
			body.push(line_break + 'Content-Type: ' + type + line_break + line_break + content);
			counter--;
			ready();
		}

		// Add new things to the object
		this.append = function(content, type){

			// Does the content have an array
			if(typeof(content) === "string" || !('length' in Object(content)) ){
				// converti to multiples
				content = [content];
			}

			for(var i=0;i<content.length;i++){

				counter++;

				var item = content[i];

				// Is this a file?
				if(item instanceof window.File || item instanceof window.Blob){
					addFile(item);
				}
				else{
					addContent(item, type);
				}
			}
		};

		this.onready = function(fn){
			ready = function(){
				if( counter===0 ){
					// trigger ready
					body.unshift('');
					body.push('--');
					fn( body.join(delim), boundary);
					body = [];
				}
			};
			ready();
		};
	}


	/*
	//
	// Events
	//
	var addEvent, removeEvent;

	if(document.removeEventListener){
		addEvent = function(elm, event_name, callback){
			elm.addEventListener(event_name, callback);
		};
		removeEvent = function(elm, event_name, callback){
			elm.removeEventListener(event_name, callback);
		};
	}
	else if(document.detachEvent){
		removeEvent = function (elm, event_name, callback){
			elm.detachEvent("on"+event_name, callback);
		};
		addEvent = function (elm, event_name, callback){
			elm.attachEvent("on"+event_name, callback);
		};
	}

	//
	// postMessage
	// This is used whereby the browser does not support CORS
	//
	var xd_iframe, xd_ready, xd_id, xd_counter, xd_queue=[];
	function xd(method, url, headers, body, callback){

		// This is the origin of the Domain we're opening
		var origin = 'https://content.googleapis.com';

		// Is this the first time?
		if(!xd_iframe){
			// Create the proxy window
			xd_iframe = utils.append('iframe', { src : origin + "/static/proxy.html?jsh=m%3B%2F_%2Fscs%2Fapps-static%2F_%2Fjs%2Fk%3Doz.gapi.en.mMZgig4ibk0.O%2Fm%3D__features__%2Fam%3DEQ%2Frt%3Dj%2Fd%3D1%2Frs%3DAItRSTNZBJcXGialq7mfSUkqsE3kvYwkpQ",
										style : {position:'absolute',left:"-1000px",bottom:0,height:'1px',width:'1px'} }, 'body');

			// Listen for on ready events
			// Set the window listener to handle responses from this
			addEvent( window, "message", function CB(e){

				// Try a callback
				if(e.origin !== origin){
					return;
				}

				try{

					var r = JSON.parse(e.data),
						m = /^ready\:(\d+)$/;

					if(r && r.s && r.s.match(m)){
						xd_id = r.s.match(m)[1];
						xd_ready = true;
						xd_counter = 0;

						for(var i=0;i<xd_queue.length;i++){
							xd_queue[i]();
						}
					}
				}
				catch(ee){
					// This wasn't meant to be
					return;
				}

			});
		}

		//
		// Action
		// This is the function to call if/once the proxy has successfully loaded
		// If makes a call to the IFRAME
		var action = function(){

			var nav = window.navigation,
				position = ++xd_counter;

			// The endpoint is ready send the response
			var message = JSON.stringify({
				"s":"makeHttpRequests",
				"f":"..",
				"c":position,
				"a":[[{
					"key":"gapiRequest",
					"params":{
						"url":url,
						"httpMethod":method.toUpperCase(),
						"body": body,
						"headers":{
							"Content-Type":headers['content-type'],
							"X-Origin":window.location.origin,
							"X-ClientDetails":"appVersion="+nav.appVersion+"&platform="+nav.platform+"&userAgent="+nav.uaerAgent
						},
						/*
						//urlParams":{
						//	"uploadType":"multipart"
						//},
						"clientName":"google-api-javascript-client",
						"clientVersion":"1.1.0-beta"
					}
				}]],
				"t":id,
				"l":false,
				"g":true,
				"r":".."
			});

			addEvent( window, "message", function CB2(e){

				if(e.origin !== origin ){
					// not the incoming message we're after
					return;
				}

				// Decode the string
				try{
					var json = JSON.parse(e.data);
					if( json.t === xd_id && json.a[0] === position ){
						removeEvent( window, "message", CB2);
						callback(json.a[1]);
					}
				}
				catch(ee){}
			});

			// Post a message to iframe once it has loaded
			iframe.contentWindow.postMessage(message, '*');
		};


		//
		// Check to see if the proy has loaded,
		// If it has then action()!
		// Otherwise, xd_queue until the proxy has loaded
		if(xd_ready){
			action();
		}
		else{
			xd_queue.push(action);
		}
	}
	*/

	//
	// URLS
	var contacts_url = 'https://www.google.com/m8/feeds/contacts/default/full?alt=json&max-results=@{limit|1000}&start-index=@{start|1}';

	//
	// Embed
	hello.init({
		google : {
			name : "Google Plus",

			// Login
			login : function(p){
				// Google doesn't like display=none
				if(p.qs.display==='none'){
					p.qs.display = '';
				}
			},

			// REF: http://code.google.com/apis/accounts/docs/OAuth2UserAgent.html
			oauth : {
				version : 2,
				auth : "https://accounts.google.com/o/oauth2/auth"
			},

			// Authorization scopes
			scope : {
				//,
				basic : "https://www.googleapis.com/auth/plus.me https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
				email			: '',
				birthday		: '',
				events			: '',
				photos			: 'https://picasaweb.google.com/data/',
				videos			: 'http://gdata.youtube.com',
				friends			: 'https://www.google.com/m8/feeds',
				files			: 'https://www.googleapis.com/auth/drive.readonly',
				
				publish			: '',
				publish_files	: 'https://www.googleapis.com/auth/drive',
				create_event	: '',

				offline_access : ''
			},
			scope_delim : ' ',

			// API base URI
			base : "https://www.googleapis.com/",

			// Map GET requests
			get : {
				//	me	: "plus/v1/people/me?pp=1",
				'me' : 'oauth2/v1/userinfo?alt=json',

				// https://developers.google.com/+/api/latest/people/list
				'me/friends' : contacts_url,
				'me/following' : contacts_url,
				'me/followers' : contacts_url,
				'me/share' : 'plus/v1/people/me/activities/public?maxResults=@{limit|100}',
				'me/feed' : 'plus/v1/people/me/activities/public?maxResults=@{limit|100}',
				'me/albums' : 'https://picasaweb.google.com/data/feed/api/user/default?alt=json&max-results=@{limit|100}&start-index=@{start|1}',
				'me/album' : function(p,callback){
					var key = p.data.id;
					delete p.data.id;
					callback(key.replace("/entry/", "/feed/"));
				},
				'me/photos' : 'https://picasaweb.google.com/data/feed/api/user/default?alt=json&kind=photo&max-results=@{limit|100}&start-index=@{start|1}',

				// https://developers.google.com/drive/v2/reference/files/list
				'me/files' : 'drive/v2/files?q=%22@{id|root}%22+in+parents+and+trashed=false&maxResults=@{limit|100}',

				// https://developers.google.com/drive/v2/reference/files/list
				'me/folders' : 'drive/v2/files?q=%22@{id|root}%22+in+parents+and+mimeType+=+%22application/vnd.google-apps.folder%22+and+trashed=false&maxResults=@{limit|100}',

				// https://developers.google.com/drive/v2/reference/files/list
				'me/folder' : 'drive/v2/files?q=%22@{id|root}%22+in+parents+and+trashed=false&maxResults=@{limit|100}'
			},

			// Map post requests
			post : {
				/*
				// PICASA
				'me/albums' : function(p, callback){
					p.data = {
						"title": p.data.name,
						"summary": p.data.description,
						"category": 'http://schemas.google.com/photos/2007#album'
					};
					callback('https://picasaweb.google.com/data/feed/api/user/default?alt=json');
				},
				*/
				// DRIVE
				'me/files' : function(p, callback){
					if( p.data && p.data instanceof window.HTMLInputElement ){
						p.data = { file : p.data };
					}
					if( !p.data.name && Object(Object(p.data.file).files).length ){
						p.data.name = p.data.file.files[0].name;
					}
					p.data = {
						"title": p.data.name,
						"parents": [{"id":p.data.id||'root'}],
						"file" : p.data.file
					};
					callback('upload/drive/v2/files?uploadType=multipart');
				},
				'me/folders' : function(p, callback){
					p.data = {
						"title": p.data.name,
						"parents": [{"id":p.data.parent||'root'}],
						"mimeType": "application/vnd.google-apps.folder"
					};
					callback('drive/v2/files');
				}
			},

			// Map DELETE requests
			del : {
				'me/files' : 'https://www.googleapis.com/drive/v2/files/@{id}'
			},

			wrap : {
				me : function(o){
					if(o.id){
						o.last_name = o.family_name || (o.name? o.name.familyName : null);
						o.first_name = o.given_name || (o.name? o.name.givenName : null);
	//						o.name = o.first_name + ' ' + o.last_name;
						o.picture = o.picture || ( o.image ? o.image.url : null);
						o.thumbnail = o.picture;
						o.name = o.displayName || o.name;
					}
					return o;
				},
				'me/friends'	: formatFriends,
				'me/followers'	: formatFriends,
				'me/following'	: formatFriends,
				'me/share' : function(o){
					paging(o);
					o.data = o.items;
					delete o.items;
					return o;
				},
				'me/feed' : function(o){
					paging(o);
					o.data = o.items;
					delete o.items;
					return o;
				},
				'me/albums' : gEntry,
				'me/photos' : gEntry,
				'default' : gEntry
			},
			xhr : function(p){
				if(p.method==='post'){

					// Does this contain binary data?
					if(utils.hasBinary(p.data)){
						// There is noway, as it appears, to Upload a file along with its meta data
						// So lets cancel the typical approach and use the override '{ api : function() }' below
						return false;
					}

					// Convert the POST into a javascript object
					p.data = JSON.stringify(p.data);
					p.headers = {
						'content-type' : 'application/json'
					};
				}
				return true;
			},

			//
			// Custom API handler, overwrites the default fallbacks
			// Performs a postMessage Request
			//
			api : function(url,p,qs,callback){

				// Dont use this function for GET requests
				if(p.method==='get'){
					return;
				}

				// Contain inaccessible binary data?
				// If there is no "files" property on an INPUT then we can't get the data
				if( utils.hasBinary(p.data) && "file" in p.data && !( "files" in p.data.file ) ){
					callback({
						error : {
							code : 'request_invalid',
							message : "Sorry, can't upload your files to Google Drive in this browser"
						}
					});
				}

				// Extract the file, if it exists from the data object
				// If the File is an INPUT element lets just concern ourselves with the NodeList
				var file;
				if( "file" in p.data ){
					file = p.data.file;
					delete p.data.file;

					if("files" in file){
						// Assign the NodeList
						file = file.files;
					}
					if(!file || !file.length){
						callback({
							error : {
								code : 'request_invalid',
								message : 'There were no files attached with this request to upload'
							}
						});
						return;
					}
				}


//				p.data.mimeType = Object(file[0]).type || 'application/octet-stream';

				// Construct a multipart message
				var parts = new Multipart();
				parts.append( JSON.stringify(p.data), 'application/json');

				// Read the file into a  base64 string... yep a hassle, i know
				// FormData doesn't let us assign our own Multipart headers and HTTP Content-Type
				// Alas GoogleApi need these in a particular format
				if(file){
					parts.append( file );
				}

				parts.onready(function(body, boundary){

					// Does this endpoint support CORS?
					// Then run the XHR function					
					utils.xhr( p.method, utils.qs(url,qs), {
						'content-type' : 'multipart/related; boundary="'+boundary+'"'
					}, body, callback );


					/*
						// Otherwise lets POST the data the good old fashioned way postMessage
						xd( p.method, utils.qs(url,qs), {
							'content-type' : 'multipart/related; boundary="'+boundary+'"'
						}, body, callback );
					*/
				});

				return true;
			}
		}
	});
})(hello, window);
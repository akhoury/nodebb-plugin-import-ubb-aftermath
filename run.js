var $ = require('cheerio'),
	path = require('path'),
	fs = require('fs-extra'),
	async = require('async'),
	htmlMd = require('html-md'),
	User, Posts, db, nconf;

// todo: this is such a bummer !!!
console.log('in order to require any NodeBB Object, nconf.get(\'database\') needs to be set');
console.log('so let\'s require nconf first');
try {
	nconf = require('../nconf');
} catch (err) {
	throw err;
}
var nconfFile = path.join(__dirname, '../../config.json');

// see if the NodeBB config.json exists
if (fs.existsSync(nconfFile)) {
	console.log('config.json is there, load it and use these values');
	var nconfigs = fs.readJsonSync(nconfFile);
	nconfigs.use_port = nconfigs.use_port ? 'y' : 'n';
} else {
	console.log(nconfFile + ' does not exists, i\'m throwing an error');
	throw new Error('run: node app --setup # to create a config.json');
}

console.log('tell nconf to read it, not sure if I can pass the values in memory, but what the hell, it\'s not a huge file anyways');
nconf.file({file: nconfFile});

// requiring DB after configs, since it could be either mongo or redis now
if (nconfigs.database === 'redis') {
	nconf.set('database', 'redis');
} else if (nconfigs.database === 'mongo') {
	nconf.set('database', 'mongo');
} else {
	throw new Error('NodeBB Database config is not set');
}

// activated or not, still works if it lives in NodeBB/node_modules/nodebb-plugin-importer-ubb-aftermath
try {
	User = module.parent.require('./user.js');
	Posts = module.parent.require('./posts.js');
	db = module.parent.require('./database.js');
} catch (e) {
	User = require('../../src/user.js');
	Posts = require('../../src/posts.js');
	db = require('../../src/database.js');
}

var emotionsMap = {
		'blush': ':blush:',
		'book': ':book:',
		'blank': ':white_square:',
		'confused': ':confused:',
		'cool': ':sunglasses:',
		'crazy': ':scream_cat:',
		'cry': ':cry:',
		'eek': ':fearful:',
		'frown': ':frowning:',
		'grin': ':grin:',
		'laugh': ':laughing:',
		'mad': ':angry:',
		'shocked': ':open_mouth:',
		'sick': ':tired_face:',
		'sleep': ':sleeping:',
		'smile': ':smile:',
		'smirk': ':smirk:',
		'tired': ':tired_face:',
		'tongue': ':stuck_out_tongue_winking_eye:',
		'whistle': ':eyes:',
		'wink': ':wink:',
		'thumbs_down': ':thumbsdown:',
		'thumbs_up': ':thumbsup:',
		'lightbulb': ':flashlight:',
		'exclamation': ':exclamation:'
	},

	imagesToEmoji = function (content) {
		var contentEl = $('<div> ' + content + ' </div>');
		var imgs = contentEl.find('img');
		imgs.each(function(i, img){
			img = $(img);
			var src = img.attr('src') || '';
			if (src.indexOf('/forums/images') >= 0 || src.indexOf('ubbthreads/') >= 0) {
				var lastSlash = src.lastIndexOf('/');
				var lastDot = src.lastIndexOf('.');
				if (lastSlash >= 0 && lastDot >= 0) {
					var emotion = src.substring(lastSlash + 1, lastDot);
					if (emotionsMap[emotion]) {
						img.replaceWith('<span>' + emotionsMap[emotion] + '</span>');
					}
				}
			}
		});
		return contentEl.html();
	},

	cleanUsers = function(done){
		console.log('cleanUsers started');
		var t0 = +new Date();

		db.getObjectValues('username:uid', function(err, uids) {
			async.each(uids, function(uid, next) {
				User.getUserField(uid, 'birthday', function(err, birthday) {
					if(err) {
						return next(err);
					}
					birthday = parseInt(birthday, 10);
					if(birthday === 0) {
						User.setUserField(uid, 'birthday', '', next);
					} else {
						next();
					}
				});
			}, function(err) {
				console.log('cleanUsers took: ' + ((+new Date() - t0) / 1000 / 60).toFixed(2) + ' minutes');
				done(err);
			});
		});
	},

	cleanPostContent = function(content) {
		content = content.replace('img src="/ubbthreads/images', 'img src="http://www.afraidtoask.com./forums/images');
		content = imagesToEmoji(content);
		return htmlMd(content) || '';

	},

	cleanPostsContent = function(done){
		console.log('cleanPostsContent started');
		var t0 = +new Date();

		db.keys('post:*', function(err, keys) {
			async.eachLimit(keys, 5, function(key, next) {
				db.getObjectFields(key, ['content'], function(err, data) {
					if(err) {
						return next(err);
					}
					data.content = cleanPostContent(data.content || '');
					db.setObjectField(key, 'content', data.content, next);
				});

			}, function(err) {
				console.log('cleanPostsContent took: ' + ((+new Date() - t0) / 1000 / 60).toFixed(2) + ' minutes');
				done(err);
			});
		});
	};

console.log('starting..');
async.series([
	cleanUsers,
	cleanPostsContent
],
	function(err){
		if (err) throw err;
		console.log('ALL DONE!');
		process.exit(1);
	}
);

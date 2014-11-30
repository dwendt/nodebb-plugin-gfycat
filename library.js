(function() {
    "use strict";
    /* jshint indent: 4 */
    var	request = require('request'),
        async = module.parent.require('async'),
        winston = module.parent.require('winston'),
        S = module.parent.require('string'),
        meta = module.parent.require('./meta'),
        gfycatRegex = /(?:https?:\/\/)?(?:gfycat\.com)\/?([\w\-_]+)/g,
        Embed = {},
        cache, appModule;
    var getgfycat = function(gfycatKey, callback) {
        var gfycatNum = gfycatKey.split('.com/')[1];
        request.get({
            url: 'http://gfycat.com/cajax/get/' + gfycatNum + ''
        }, function (err, response, body) {
            if (!err && response.statusCode === 200) {
                var gfycatData = JSON.parse(body).gfyItem;

                if (!gfycatData) {
                    return callback(null, {});
                }
                callback(null, {
                    width: gfycatData.width,
                    height: gfycatData.height,
                    webmUrl: gfycatData.webmUrl,
                    gifUrl: gfycatData.gifUrl,
                    mp4Url: gfycatData.mp4Url,
                    gfyId: gfycatData.gfyId,
                    name: gfycatData.name,
                    numFrames: gfycatData.numFrames
                });
            } else {
                winston.warn("Gfycat API failure:", err, response, body);
                callback(err);
            }
        });
    };

    Embed.init = function(data, callback) { 
        function render(req, res, next) {
            res.render('partials/gfycat-block', {});
        }
        appModule = data.app;

        if ( callback )
        callback();
    };

    Embed.parsePost = function(data, callback) {
        if (data && data.postData && data.postData.content) {
            Embed.parse(data.postData.content, function(err, raw) {
                if (err) return callback(err, data);

                data.postData.content = raw;
                callback(null, data);
            });
        } else {
            callback(null, data);
        }
    };

    Embed.parse = function(raw, callback) {
        var gfycatKeys = [], matchReplace = [],
            matches, cleanedText;

        cleanedText = S(raw).stripTags().s;
        matches = cleanedText.match(gfycatRegex);

        if (matches && matches.length) {
            matches.forEach(function(match) {
                if (match === null || match === "null" || gfycatKeys.indexOf(match) === -1 || match.length < 1) {
                    gfycatKeys.push(match);
                }
            });
        } else {
            return callback(null, raw);
        }

        async.map(gfycatKeys, function(gfycatKey, next) {
            if (cache.has(gfycatKey)) {
                next(null, cache.get(gfycatKey));
            } else {
                getgfycat(gfycatKey, function(err, gfycatObj) {
                    if (err) {
                        return next(err);
                    }
                    gfycatObj.name = gfycatKey;

                    cache.set(gfycatKey, gfycatObj);
                    next(err, gfycatObj);
                });
            }
        }, function(err, gfycatinfo) {
            if (!err) {
                appModule.render('partials/gfycat-block', {
                    gfycatinfo: gfycatinfo
                }, function(err, html) {
                    gfycatinfo = gfycatinfo[0];
                    matchReplace.push({"name": gfycatinfo.name, "html": html});
                });
            } else {
                winston.warn('Encountered an error parsing gfycat embed code, not continuing', raw);
                return callback(null, raw);
            }
        });

        matchReplace.forEach(function(match) {
          raw = raw.split(match.name).join(match.html);
        });

        callback(null, raw);
    };
// Initial setup
    cache = require('lru-cache')({
        maxAge: 1000*60*60*24,
        max: 100
    });
    module.exports = Embed;
})();

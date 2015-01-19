var express = require('express');
var router = express.Router();
var http = require('http');
var url = require('url');

/* GET users listing. */
router.get('/', function(req, res, next) {
    var session = req.session;
    res.render('figures', { username: session.username });
});

function parsePictures(gallery, db, username, figureid)
{
    var images = db.get('images');
    var figuresimages = db.get('figuresimages');
    var picids = [];
    if (!(gallery.picture instanceof Array))
        gallery.picture = [gallery.picture];
    for (var i in gallery.picture) {
        var pic = gallery.picture[i];
        var src = pic.full;
        var cat = pic.category;
        var id = parseInt(pic.id);
        console.log("!      parse picture " + id + " for item " + figureid);
        if (cat.name === "Official") {
            // official picture, get it
            picids.push(id);

            var u = url.parse(src);
            http.get({
                hostname: u.hostname,
                port: u.port || 80,
                path: u.path
            }, function(res) {
                var image = '';
                res.setEncoding('binary');
                res.on('data', function(chunk) {
                    image += chunk;
                });
                res.on('end', function() {
                    // store image
                    images.insert({picid: id, data: image});
                });
            });
        }
    }
    console.log('figuresimages.update({figureid: ' + figureid + '},{"$push": {images: {"$each": ' + JSON.stringify(picids) + '}}});');

    figuresimages.update({figureid: figureid},
                         {"$push": {
                             images: {
                                 "$each": picids
                             }
                         }});
}

function parseOwned(owned, db, username) {
    var figures = db.get('figures');
    var figuresimages = db.get('figuresimages');
    if (!(owned.item instanceof Array))
        owned.item = [owned.item];
    for (var i in owned.item) {
        var item = owned.item[i];
        var id = parseInt(item.data.id);
        console.log("!  parse item " + id);
        var name = item.data.name;
        var released = item.data.release_date;
        var price = item.data.price;
        // get the pictures

        (function(id) {
            figures.insert({figureid: id, name: name, released: released, price: price});
            figuresimages.insert({figureid: id, images: []}, function(err, doc) {
                if (err)
                    return;
                var gallery = function(id, page, pages) {
                    http.get({
                        hostname: 'myfigurecollection.net',
                        port: 80,
                        path: '/api.php?mode=gallery&type=json&item=' + id + '&page=' + page
                    }, function(res) {
                        var data = "";
                        res.on('data', function(chunk) {
                            data += chunk;
                        });
                        res.on('end', function() {
                            var json = JSON.parse(data).gallery;
                            // find all the official images
                            console.log("!    parse pictures page for " + id + " page " + page + ", remaining " + pages);
                            if (json.picture)
                                parsePictures(json, db, username, id);
                            if (pages === undefined)
                                pages = parseInt(json.num_pages);
                            --pages;
                            if (pages > 0) {
                                ++page;
                                gallery(id, page, pages);
                            }
                        });
                    });
                };
                gallery(id, 1);
            });
        })(id);
    }
};

router.get('/import', function(req, res, next) {
    var user = req.query.importuser;
    if (user) {
        // do an MFC API query for user
        var mfc = function(page, pages) {
            http.get({
                hostname: 'myfigurecollection.net',
                port: 80,
                path: '/api.php?mode=collection&type=json&username=' + user + '&status=2&page=' + page
            }, function(res) {
                var data = "";
                res.on('data', function(chunk) {
                    data += chunk;
                });
                res.on('end', function() {
                    var obj = JSON.parse(data);
                    var owned = obj.collection.owned;
                    console.log("!parse collection page " + page);
                    if (owned.item)
                        parseOwned(owned, req.db, req.session.username);
                    if (pages === undefined)
                        pages = parseInt(owned.num_pages);
                    --pages;
                    if (pages > 0) {
                        ++page;
                        mfc(page, pages);
                    }
                });
            });
        };
        mfc(1);
    }

    res.render('importmfc', { importuser: user });
});

router.get('/list/figures', function(req, res, next) {
    var user = req.session.username;
    var search = req.query.search;
    var db = req.db;
    var figures = db.get('figures');
    var promise;
    if (search) {
        var rx = new RegExp('.*' + search + '.*', 'i');
        promise = figures.find({name: rx}, {});
    } else {
        promise = figures.find({}, {});
    }
    if (req.query.hasOwnProperty("search")) {
        promise.on('success', function(doc) {
            res.render('listfigurespartial', { figures: doc });
        });
    } else {
        promise.on('success', function(doc) {
            res.render('listfigures', { figures: doc });
        });
    }
});

module.exports = router;

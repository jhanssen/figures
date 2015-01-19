var express = require('express');
var router = express.Router();
var http = require('http');
var url = require('url');
var importmfc = require('./importmfc');

/* GET users listing. */
router.get('/', function(req, res, next) {
    var session = req.session;
    res.render('figures', { username: session.username });
});

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
                        importmfc.parseOwned(owned, req.db, req.session.username);
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

router.get('/list/figure', function(req, res, next) {
    var figureid = parseInt(req.query.id);
    if (!figureid) {
        res.send('Invalid id');
        return;
    }
    var figures = req.db.get('figures');
    var promise = figures.find({figureid: figureid}, {});
    promise.on('success', function(doc) {
        if (!doc.length) {
            res.send('No figure');
            return;
        }
        var figure = doc[0];
        res.render('listfigure', { name: figure.name, images: doc[0].images || [], figure: figure.figureid, notes: figure.notes });
    });
});

function filterInt(value) {
    if(/^(\-|\+)?([0-9]+|Infinity)$/.test(value))
        return Number(value);
    return NaN;
}

router.get('/list/image', function(req, res, next) {
    var images = req.db.get('images');
    var imageid = filterInt(req.query.id) || images.id(req.query.id);
    if (!imageid) {
        res.send('Invalid id');
        return;
    }
    var promise = images.find({picid: imageid}, {});
    promise.on('success', function(doc) {
        console.log(typeof doc, imageid);
        if (!doc.length) {
            res.send('No data');
            return;
        }
        res.setHeader('content-type', 'image/jpeg');
        if (typeof doc[0].data === 'object' && doc[0].data.buffer)
            res.end(doc[0].data.buffer, 'binary');
        else
            res.end(doc[0].data, 'binary');
    });
});

router.get('/remove/image', function(req, res, next) {
    var images = req.db.get('images');
    var imageid = filterInt(req.query.id) || images.id(req.query.id);
    var figureid = parseInt(req.query.figureid);
    if (!imageid || !figureid) {
        res.send('Invalid id');
        return;
    }
    images.remove({picid: imageid});

    var figures = req.db.get('figures');
    var promise = figures.update({figureid: figureid},
                                 {"$pull": {
                                     images: imageid
                                 }});
    promise.on('complete', function() {
        res.location("/figures/list/figure?id=" + figureid);
        res.redirect("/figures/list/figure?id=" + figureid);
    });
});

router.all('/add/image', function(req, res, next) {
    var id = parseInt(req.query.id || req.body.id);
    if (!id) {
        res.send('Invalid id');
        return;
    }

    var path = req.files && req.files.path;
    if (path) {
        var images = req.db.get('images');
        var figures = req.db.get('figures');
        var imgid = images.id();
        console.log('new image', imgid);
        var promise = images.insert({picid: imgid, data: path.buffer});
        promise.on('success', function() {
            promise = figures.update({figureid: id},
                                     {"$push": {
                                         images: imgid
                                     }});
            promise.on('success', function() {
                res.location("/figures/list/figure?id=" + id);
                res.redirect("/figures/list/figure?id=" + id);
            });
        });
    } else {
        res.render('addimage', { figure: id });
    }
});

module.exports = router;

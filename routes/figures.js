var express = require('express');
var router = express.Router();
var http = require('http');
var url = require('url');
var importmfc = require('./importmfc');
var MPromise = require('mpromise');

/* GET users listing. */
router.get('/', function(req, res, next) {
    var session = req.session;
    res.render('figures', { username: session.username });
});

router.get('/import', function(req, res, next) {
    var user = req.query.importuser;
    if (user) {
        importmfc.importmfc(req, user, 1);
    }

    res.render('importmfc', { importuser: user });
});

router.get('/list/tags', function(req, res, next) {
    var tags = Object.create(null);
    var figures = req.db.get('figures');
    var promise = figures.find({uid: req.session.userid}, {});
    promise.on('success', function(doc) {
        for (var i in doc) {
            var figure = doc[i];
            for (var j in figure.tags) {
                tags[figure.tags[j]] = true;
            }
        }
        res.render('listtags', {tags: tags});
    });
});

router.get('/list/tag', function(req, res, next) {
    if (!req.query.hasOwnProperty('tags')) {
        res.send('No tag');
        return;
    }
    var tags = req.query.tags.split(',');

    var figures = req.db.get('figures');
    var promise = figures.find({uid: req.session.userid, tags: {"$all": tags}},{});
    promise.on('success', function(doc) {
        res.render('listfigures', { figures: doc, figureSelected: {}, selector: false, tags: tags });
    });
});

router.get('/list/figures', function(req, res, next) {
    var search = req.query.search;
    var tags = req.query.tags ? req.query.tags.split(',') : undefined;
    var db = req.db;
    var figures = db.get('figures');
    var uid = req.session.userid;
    var promise;
    var opt = {sort: {name: 1}};
    if (search) {
        var rx = new RegExp('.*' + search + '.*', 'i');
        if (tags)
            promise = figures.find({name: rx, uid: uid, tags: {"$all": tags}}, opt);
        else
            promise = figures.find({name: rx, uid: uid}, opt);
    } else {
        if (tags)
            promise = figures.find({uid: uid, tags: {"$all": tags}}, opt);
        else
            promise = figures.find({uid: uid}, opt);
    }
    if (req.query.hasOwnProperty("search")) {
        var selector = req.query.hasOwnProperty("selector");
        var selected = {};
        if (req.query.hasOwnProperty("selected")) {
            selected = JSON.parse(req.query.selected);
        }
        promise.on('success', function(doc) {
            res.render('listfigurespartial', { figures: doc, figureSelected: selected, selector: selector, tags: [] });
        });
    } else {
        promise.on('success', function(doc) {
            res.render('listfigures', { figures: doc, figureSelected: {}, selector: false, tags: [] });
        });
    }
});

router.get('/list/figure', function(req, res, next) {
    var figures = req.db.get('figures');
    if (!req.query.hasOwnProperty('id')) {
        res.send('Invalid id');
        return;
    }
    var figure, box, linknames;
    var figureid = figures.id(req.query.id);
    var promise = figures.find({uid: req.session.userid, _id: figureid}, {});
    promise.then(function(doc) {
        if (!doc.length) {
            throw "/figures/list/figures";
        }
        figure = doc[0];
        // do the box lookup
        var boxes = req.db.get('boxes');
        return boxes.find({figures: {"$in": [figure._id]}},{});
    }).then(function(doc) {
        if (doc.length)
            box = doc[0];
        var links = req.db.get('links');
        return links.find({"$or": [{from: figureid}, {to: figureid}]});
    }).then(function(doc) {
        if (!doc.length) {
            // fake success
            var promise = new MPromise();
            promise.fulfill([]);
            return promise;
        }
        var objs = [];
        for (var i in doc) {
            if (!doc[i].from.equals(figureid)) {
                objs.push({_id: doc[i].from});
            } else {
                objs.push({_id: doc[i].to});
            }
        }
        return figures.find({"$or": objs});
    }).then(function(doc) {
        if (doc.length)
            linknames = doc;
        if (figure.notes.length) {
            var notes = req.db.get('notes');
            return notes.find({_id: {"$in": figure.notes}}).then(function(doc) {
                res.render('listfigure', { name: figure.name, images: figure.images || [], figure: figure._id, notes: doc, tags: figure.tags || [], mfcid: figure.mfcid, box: box, links: linknames });
            });
        } else {
            res.render('listfigure', { name: figure.name, images: figure.images || [], figure: figure._id, notes: [], tags: figure.tags || [], mfcid: figure.mfcid, box: box, links: linknames });
            return undefined;
        }
    }).end(function(err) {
        if (typeof err === "string") {
            res.location(err);
            res.redirect(err);
        }
    });
});

router.get('/mod/figureimage', function(req, res, next) {
    if (!req.query.hasOwnProperty('id')
        || !req.query.hasOwnProperty('from')
        || !req.query.hasOwnProperty('to')) {
        res.send('Invalid id');
        return;
    }
    var figures = req.db.get('figures');
    var figureid = figures.id(req.query.id);
    var promise = figures.find({uid: req.session.userid, _id: figureid}, {});
    promise.on('success', function(doc) {
        var figure = doc[0];
        if (!figure.images.length) {
            res.send('No image');
            return;
        }

        var images = req.db.get('images');
        var fromid = images.id(req.query.from);
        var toid = images.id(req.query.to);

        var fromidx = -1, toidx = -1;
        var imagelist = figure.images;
        for (var i in imagelist) {
            var curimg = imagelist[i];
            if (curimg.equals(fromid)) {
                fromidx = i;
            }
            if (curimg.equals(toid)) {
                toidx = i;
            }
        }
        if (fromidx != -1 && toidx != -1) {
          if (fromidx < toidx) {
            // first remove to
            imagelist.splice(toidx, 1);
            // remove from, insert to
            imagelist.splice(fromidx, 1, toid);
            // insert from at to
            imagelist.splice(toidx, 0, fromid);
          } else {
            // first remove from
            imagelist.splice(fromidx, 1);
            // remove to, insert from
            imagelist.splice(toidx, 1, fromid);
            // insert to at from
            imagelist.splice(fromidx, 0, toid);
          }

          figures.update({_id: figureid}, {"$set": {images: imagelist}});
        }
        res.location("/figures/list/figure?id=" + figureid);
        res.redirect("/figures/list/figure?id=" + figureid);
    });
});

router.get('/list/firstimage', function(req, res, next) {
    if (!req.query.hasOwnProperty('id')) {
        res.send('Invalid id');
        return;
    }
    var figure;
    var figures = req.db.get('figures');
    var figureid = figures.id(req.query.id);
    var promise = figures.find({uid: req.session.userid, _id: figureid}, {});
    promise.then(function(doc) {
        if (!doc.length) {
            throw 'figureimage error, id?';
        }
        figure = doc[0];
        if (!figure.images.length) {
            throw 'no image';
        }
        var images = req.db.get('images');
        return images.find({_id: figure.images[0]}, {});
    }).then(function(doc) {
        if (!doc.length) {
            res.send('No data');
            return;
        }
        res.setHeader('content-type', 'image/jpeg');
        if (typeof doc[0].data === 'object' && doc[0].data.buffer)
            res.end(doc[0].data.buffer, 'binary');
        else
            res.end(doc[0].data, 'binary');
    }).end(function(err) {
        if (typeof err === "string") {
            res.send(err);
        }
    });
});

router.get('/list/image', function(req, res, next) {
    var images = req.db.get('images');
    if (!req.query.hasOwnProperty('id')) {
        res.send('Invalid id');
        return;
    }
    var imageid = images.id(req.query.id);
    var promise = images.find({_id: imageid}, {});
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
    var figures = req.db.get('figures');
    if (!req.query.hasOwnProperty('id') || !req.query.hasOwnProperty('figureid')) {
        res.send('Invalid id');
        return;
    }
    var imageid = images.id(req.query.id);
    var figureid = figures.id(req.query.figureid);
    images.remove({_id: imageid});

    var promise = figures.update({_id: figureid},
                                 {"$pull": {
                                     images: imageid
                                 }});
    promise.on('complete', function() {
        res.location("/figures/list/figure?id=" + figureid);
        res.redirect("/figures/list/figure?id=" + figureid);
    });
});

router.post('/add/tag', function(req, res, next) {
    if (!req.body.hasOwnProperty('figureid')) {
        res.send('Invalid id');
        return;
    }
    var figures = req.db.get('figures');
    var id = figures.id(req.body.figureid);
    var tag = req.body.tag;
    if (typeof tag !== "string" || !tag.length) {
        res.location("/figures/list/figure?id=" + id);
        res.redirect("/figures/list/figure?id=" + id);
        return;
    }
    var promise = figures.update({_id: id},
                                 {"$push": {
                                     tags: tag
                                 }});
    promise.on('success', function() {
        res.location("/figures/list/figure?id=" + id);
        res.redirect("/figures/list/figure?id=" + id);
    });
});

router.get('/remove/tag', function(req, res, next) {
    if (!req.query.hasOwnProperty('figureid')) {
        res.send('Invalid id');
        return;
    }
    var figures = req.db.get('figures');
    var id = figures.id(req.query.figureid);
    var tag = req.query.tag;
    if (typeof tag !== "string" || !tag.length) {
        res.location("/figures/list/figure?id=" + id);
        res.redirect("/figures/list/figure?id=" + id);
        return;
    }
    var promise = figures.update({_id: id},
                                 {"$pull": {
                                     tags: tag
                                 }});
    promise.on('success', function() {
        res.location("/figures/list/figure?id=" + id);
        res.redirect("/figures/list/figure?id=" + id);
    });
});

router.all('/add/image', function(req, res, next) {
    var figures = req.db.get('figures');
    if (!('id' in req.query) && !('id' in req.body)) {
        res.send('Invalid id');
        return;
    }
    var id = figures.id(req.query.id || req.body.id);

    var path = req.file;
    if (path) {
        var images = req.db.get('images');
        var imgid = images.id();
        console.log('new image', imgid);
        var promise = images.insert({_id: imgid, data: path.buffer});
        promise.on('success', function() {
            promise = figures.update({_id: id},
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

router.all('/add/note', function(req, res, next) {
    var figures = req.db.get('figures');
    if (!req.query.hasOwnProperty('id') && !req.body.hasOwnProperty('id')) {
        res.send('Invalid id');
        return;
    }
    var id = figures.id(req.query.id || req.body.id);

    var note = req.body.note;
    if (note) {
        var notes = req.db.get('notes');
        var noteid = notes.id();
        var promise = notes.insert({_id: noteid, uid: req.session.userid, note: note, figures: [id]});
        promise.on('success', function() {
            promise = figures.update({_id: id},
                                      {"$push": {
                                          notes: noteid
                                      }});
            promise.on('success', function() {
                res.location("/figures/list/figure?id=" + id);
                res.redirect("/figures/list/figure?id=" + id);
            });
        });
    } else {
        res.render('addnote', { figure: id });
    }
});

router.all('/add/box', function(req, res, next) {
    var box = req.body.box;
    if (box) {
        var boxes = req.db.get('boxes');
        var promise = boxes.insert({box: box, uid: req.session.userid, figures: []});
        promise.on('success', function() {
            promise.on('success', function() {
                res.location("/figures/list/boxes");
                res.redirect("/figures/list/boxes");
            });
        });
    } else {
        res.render('addbox');
    }
});

router.all('/add/figure', function(req, res, next) {
    var name = req.body.name;
    if (name) {
        var figures = req.db.get('figures');
        var promise = figures.insert({name: name, uid: req.session.userid, images: [], notes: [], tags: []});
        promise.on('success', function() {
            res.location("/figures/list/figures");
            res.redirect("/figures/list/figures");
        });
    } else {
        res.render('addfigure');
    }
});

router.get('/remove/figure', function(req, res, next) {
    var figures = req.db.get('figures');
    if (!req.query.hasOwnProperty('id')) {
        res.send('Invalid id');
        return;
    }
    var figureid = figures.id(req.query.id);
    console.log('removing ' + figureid);
    var promise = figures.remove({_id: figureid});
    promise.on('success', function() {
        res.location("/figures/list/figures");
        res.redirect("/figures/list/figures");
    });
});

router.get('/remove/note', function(req, res, next) {
    var notes = req.db.get('notes');
    var figures = req.db.get('figures');
    if (!req.query.hasOwnProperty('id')) {
        res.send('Invalid id');
        return;
    }

    var noteid = notes.id(req.query.id);
    var figureid;
    if (req.query.hasOwnProperty('figureid'))
        figureid = figures.id(req.query.figureid);

    var promise;
    if (!figureid) {
        notes.remove({_id: noteid});
        // remove the note from all figures
        promise = figures.update({}, {"$pull": { notes: noteid }});
    } else {
        notes.update({_id: noteid},
                     {"$pull": {
                         figures: figureid
                     }});
        promise = figures.update({_id: figureid},
                                 {"$pull": {
                                     notes: noteid
                                 }});

    }
    promise.on('complete', function() {
        if (figureid) {
            res.location("/figures/list/figure?id=" + figureid);
            res.redirect("/figures/list/figure?id=" + figureid);
        } else {
            res.location("/figures/list/notes/");
            res.redirect("/figures/list/notes/");
        }
    });
});

router.all('/add/notefigure', function(req, res, next) {
    var figures = req.db.get('figures');
    var notes = req.db.get('notes');
    if (!req.query.hasOwnProperty('id') && !req.body.hasOwnProperty('id')) {
        res.send('Invalid id');
        return;
    }
    var promise;
    var id = notes.id(req.query.id || req.body.id);
    var check = req.body.check;
    if (typeof check === "string")
        check = [check];
    if (check && check instanceof Array) {
        var figids = [];
        for (var i in check) {
            figids.push(figures.id(check[i]));
        }
        promise = notes.update({_id: id},{"$push": {figures: {"$each": figids}}});
        promise.on('success', function() {
            promise = figures.update({_id: {"$in": figids}},{"$push": {notes: id}});
            promise.on('success', function() {
                res.location("/figures/list/notes/");
                res.redirect("/figures/list/notes/");
            });
        });
    } else {
      promise = figures.find({uid: req.session.userid}, {});
      promise.on('success', function(doc) {
          res.render('figureselector', { figures: doc, selector: true, id: id, path: '/figures/add/notefigure', figureSelected: {}, tags: [] });
      });
    }
});

router.all('/add/linkfigure', function(req, res, next) {
    var figures = req.db.get('figures');
    var links = req.db.get('links');
    if (!req.query.hasOwnProperty('id') && !req.body.hasOwnProperty('id')) {
        res.send('Invalid id');
        return;
    }
    var promise;
    var from = figures.id(req.query.id || req.body.id);
    var check = req.body.check;
    if (typeof check === "string")
        check = [check];
    if (check && check instanceof Array) {
        var figids = [];
        for (var i in check) {
            promise = links.insert({from: from, to: figures.id(check[i])});
        }
        promise.on('success', function() {
            res.location("/figures/list/figure?id=" + from);
            res.redirect("/figures/list/figure?id=" + from);
        });
    } else {
        promise = figures.find({uid: req.session.userid}, {});
        promise.on('success', function(doc) {
            res.render('figureselector', { figures: doc, selector: true, id: from, path: '/figures/add/linkfigure', figureSelected: {}, tags: [] });
        });
    }
});

router.all('/add/boxfigure', function(req, res, next) {
    var figures = req.db.get('figures');
    var boxes = req.db.get('boxes');
    if (!req.query.hasOwnProperty('id') && !req.body.hasOwnProperty('id')) {
        res.send('Invalid id');
        return;
    }
    var promise;
    var id = boxes.id(req.query.id || req.body.id);
    var check = req.body.check;
    if (typeof check === "string")
        check = [check];
    if (check && check instanceof Array) {
        var figids = [];
        for (var i in check) {
            figids.push(figures.id(check[i]));
        }
        promise = boxes.update({_id: id},{"$push": {figures: {"$each": figids}}});
        promise.on('success', function() {
            promise = figures.update({_id: {"$in": figids}},{"$push": {boxes: id}});
            promise.on('success', function() {
                res.location("/figures/list/boxes/");
                res.redirect("/figures/list/boxes/");
            });
        });
    } else {
        promise = figures.find({uid: req.session.userid}, {});
        promise.on('success', function(doc) {
            res.render('figureselector', { figures: doc, selector: true, id: id, path: '/figures/add/boxfigure', figureSelected: {}, tags: [] });
        });
    }
});

router.get('/remove/linkfigure', function(req, res, next) {
    var figures = req.db.get('figures');
    if (!req.query.hasOwnProperty('id')
        || !req.query.hasOwnProperty('other')) {
        res.send('Invalid id');
        return;
    }
    var id = figures.id(req.query.id);
    var other = figures.id(req.query.other);
    var promise;
    var links = req.db.get('links');
    promise = links.remove({from: id, to: other});
    promise.then(function(doc) {
        return links.remove({from: other, to: id});
    }).then(function(doc) {
        res.location("/figures/list/figure?id=" + id);
        res.redirect("/figures/list/figure?id=" + id);
    });
});

router.get('/remove/box', function(req, res, next) {
    var boxes = req.db.get('boxes');
    if (!req.query.hasOwnProperty('id')) {
        res.send('Invalid id');
        return;
    }
    var boxid = boxes.id(req.query.id);
    var promise = boxes.remove({_id: boxid});
    promise.on('success', function() {
        res.location("/figures/list/boxes/");
        res.redirect("/figures/list/boxes/");
    });
});

router.get('/remove/boxfigure', function(req, res, next) {
    var figures = req.db.get('figures');
    var boxes = req.db.get('boxes');
    if (!req.query.hasOwnProperty('id') || !req.query.hasOwnProperty('figureid')) {
        res.send('Invalid id');
        return;
    }
    var boxid = boxes.id(req.query.id);
    var figureid = figures.id(req.query.figureid);
    var promise = boxes.update({_id: boxid}, {"$pull": {figures: figureid}});
    promise.on('success', function() {
        res.location("/figures/list/boxes/");
        res.redirect("/figures/list/boxes/");
    });
});

router.get('/list/notes', function(req, res, next) {
    var notes = req.db.get('notes');
    var hassearch = req.query.hasOwnProperty('search');
    var search = req.query.search;
    var promise;
    if (hassearch) {
        var rx = new RegExp('.*' + search + '.*', 'i');
        promise = notes.find({uid: req.session.userid, note: rx}, {});
    } else {
        promise = notes.find({uid: req.session.userid}, {});
    }
    promise.on('success', function(doc) {
        // get the figures
        var allnotes = doc;
        var figures = req.db.get('figures');
        promise = figures.find({uid: req.session.userid},{});
        promise.on('success', function(doc) {
            var figmap = {};
            for (var i in doc) {
                figmap[doc[i]._id.toHexString()] = doc[i];
            }
            //console.log(JSON.stringify(figmap));
            if (hassearch) {
                res.render('listnotespartial', { notes: allnotes, figures: figmap });
            } else {
                res.render('listnotes', { notes: allnotes, figures: figmap });
            }
        });
    });
});

router.get('/list/boxes', function(req, res, next) {
    var boxes = req.db.get('boxes');
    var promise = boxes.find({uid: req.session.userid}, {});
    promise.on('success', function(doc) {
        // get the figures
        var allboxes = doc;
        var figures = req.db.get('figures');
        promise = figures.find({uid: req.session.userid},{});
        promise.on('success', function(doc) {
            var figmap = {};
            for (var i in doc) {
                figmap[doc[i]._id.toHexString()] = doc[i];
            }
            res.render('listboxes', { boxes: allboxes, figures: figmap });
        });
    });
});

module.exports = router;

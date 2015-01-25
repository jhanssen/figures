var express = require('express');
var bcrypt = require('bcrypt');
var router = express.Router();
var SALT_WORK_FACTOR = 10;

/* GET home page. */
router.get('/', function(req, res, next) {
    var session = req.session;
    res.render('index', { title: 'Express', username: session.username });
});

router.get('/newuser', function(req, res) {
    res.render('newuser', { title: 'Add new user' });
});

router.post('/login', function(req, res, next) {
    var db = req.db;
    var username = req.body.username;
    var pwd = req.body.password;
    var session = req.session;

    var users = db.get('users');
    var promise = users.find({ username: username }, {});
    promise.on('error', function(err) {
        res.send('Error selecting user');
    });
    promise.on('success', function(doc) {
        if (doc.length > 1) {
            res.send('Internal error');
        } else {
            var dbpwd = doc.length == 1 ? doc[0].password : "";
            bcrypt.compare(pwd, dbpwd, function(err, pwdres) {
                if (err || !pwdres) {
                    res.send('No such user and/or password');
                    return;
                }
                session.username = username;
                session.userid = doc[0]._id;
                console.log("logged in as " + session.userid);
                res.location("/figures/");
                res.redirect("/figures/");
            });
        }
    });
});

router.post('/adduser', function(req, res, next) {
    var db = req.db;
    var username = req.body.username;
    var useremail = req.body.useremail;
    var pwd1 = req.body.password1;
    var pwd2 = req.body.password2;
    if (pwd1 == "" || pwd1 != pwd2) {
        res.send("Password empty or mismatch");
        return;
    }
    var users = db.get('users');
    var promise = users.find({ username: username }, {});
    promise.on('error', function(err) {
        res.send('Error selecting user');
    });
    promise.on('success', function(doc) {
        if (doc.length > 0) {
            res.send('User already exists');
            return;
        }

        bcrypt.genSalt(SALT_WORK_FACTOR, function(err, salt) {
            if (err) {
                res.send("Unable to generate salt");
                return;
            }

            bcrypt.hash(pwd1, salt, function(err, hash) {
                if (err) {
                    res.send("Unable to hash password");
                    return;
                }

                users.insert({
                    username: username,
                    email: useremail,
                    password: hash
                }, function(err, doc) {
                    if (err) {
                        res.send("Unable to add user");
                        return;
                    }
                    res.location("/");
                    res.redirect("/");
                });
            });
        });
    });

    // create the appropriate indexes
    db.get('figures').ensureIndex({uid: 1});
    db.get('tags').ensureIndex({uid: 1});
    db.get('boxes').ensureIndex({uid: 1});
});

module.exports = router;

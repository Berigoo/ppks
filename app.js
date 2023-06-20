const express = require('express');
const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const mariadb = require('mariadb');
const url = require('url');
const bodyparser = require('body-parser');
const {del} = require("express/lib/application");

const wwclient = new Client({
	puppeteer: {
		headless: true,
		args: ['--no-sandbox']
	},
});
var app = express();
const pool = mariadb.createPool({
    host: 'localhost',
    user: 'ppks',
    password: 'chocoL4tt3',
    database: 'ppks_project'
});

var iswwclientConnect = false;
wwclient.on('qr', (qr)=>{
   qrcode.generate(qr, {small: true});
});

wwclient.on('ready', ()=>{
    iswwclientConnect = true;
    console.log("client connect");
});

app.use(bodyparser.json())
app.use(bodyparser.urlencoded({'extended': false}))

app.post('/api/otp', (req, res) => {
    if(iswwclientConnect) {
        if(req.body.id) {
            res.setHeader('Content-Type', 'application/json');
            pool.getConnection().then((conn) => {
                var otp = (Math.floor(Math.random() * 10000) + 10000).toString().substring(1);
                if (req.body.phone) {
                    const sanitized_number = req.body.phone.toString().replace(/[- )(]/g, "");
                    const numberId = wwclient.getNumberId(sanitized_number).then((id) => {
                        if (id) {
                            var msg = otp + " Adalah kode konfirmasi Anda.";
                            var sendMsg = wwclient.sendMessage(id._serialized, msg).then((msg) => {
                                conn.query("INSERT INTO user VALUES(NULL, ?, ?, ?, CURRENT_TIMESTAMP)", [req.body.id, req.body.phone, otp]).then(() => {
                                    res.json({
                                        'isAccepted': true,
                                        'info': "Message has been sent",
                                        'status-code': 1
                                    });
                                    conn.end();
                                }).catch(err => {
                                    res.json({
                                        'isAccepted': false,
                                        'info': "Could not send message",
                                        'status-code': -2
                                    })
                                });
                            });
                        } else {
                            res.json({
                                'isAccepted': false,
                                'info': "Number not Registered",
                                'status-code': -1
                            });
                            conn.end();
                        }
                    });
                } else {
                    res.json({
                        'isAccepted': false,
                        'info': "Phone number not initialized",
                        'status-code': -5
                    })
                }
            });
        }else{
            res.json({
                'isAccepted': false,
                'info': "Id not initialized",
                'status-code': -6
            })
        }
    } else {
        console.log("wwclient unconnected");
        res.sendStatus(500);
    }
}); //{id}
app.post('/api/otpverify', (req, res)=>{
    if(iswwclientConnect){
        var ret = {};
        if(req.body.id && req.body.otp) {
            res.setHeader('Content-Type', 'application/json');
            pool.getConnection().then((conn) => {
                conn.query("SELECT COUNT(1), id FROM user WHERE otp= ? ORDER BY ts DESC", req.body.otp).then((rows) => {
                    if (rows[0].id !== null) {
                        // const delta = deltaTs(conn, rows[0].id);
                        if (/*delta < 300*/true) {
                            return conn.query("UPDATE user SET otp='-' WHERE id=?", rows[0].id)
                        } else {
                            /*ret.isAccepted = false;
                            ret.info = "User otp has been expired";
                            ret.statusCode = 3
                        conn.end();*/
                        }
                    } else {
                        ret.isAccepted = false;
                        ret.info = "Otp not match or id not found";
                        ret.statusCode = -3
                        conn.end();
                    }
                }).then((rows) => {
                    if (rows) {
                        ret.isAccepted = true;
                        ret.info = "User has been verified";
                        ret.statusCode = 2
                        conn.end();
                    }
                }).then(() => {
                    res.json({
                        "isAccepted": ret.isAccepted,
                        "info": ret.info,
                        "status-code": ret.statusCode
                    })
                }).catch(err => {
                    console.log(err);
                    conn.end().then(() => {
                        res.json({
                            "isAccepted": false,
                            "info": "Could not verify",
                            "status-code": -4
                        })
                    });
                })
            });
        }else{
            res.json({
                "isAccepted": false,
                "info": "id or otp not initialized",
                "status-code": -7
            })
        }

    }else{
        console.log("wwclient unconnected");
        res.sendStatus(500);
    }
})

wwclient.on('disconnected', ()=>{
    iswwclientConnect = false;
    console.log("client diconnect");
});

wwclient.initialize();
app.listen(8000);

/*
function deltaTs(connection, id){       //Problem
    var delta = 0;
    var time = new Date();
    const now = [time.getMinutes(), time.getSeconds()];
    connection.query('SELECT ts FROM user WHERE id= ?', id).then((rows)=>{
        if(rows[0]){
            now.forEach((val, i, arr)=>{
                var t = rows[0].ts;
                console.log(t);
                t = parseInt(t);
                delta += (val - t);
                if(i === 0) delta *= 60;
            });
        }
    });
    return delta;
}*/

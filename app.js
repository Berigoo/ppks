require('dotenv').config()

const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const mariadb = require('mariadb');
const bodyparser = require('body-parser');
const jwt = require('jsonwebtoken');

const wwclient = new Client({
    // save session to local
    authStrategy: new LocalAuth({
        clientId: 'client',
        dataPath: './sessions',
      }),
	puppeteer: {
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-extensions']
	},
});

var app = express();
const pool = mariadb.createPool({
    host: process.env.HOST_DB,
    user: process.env.USER_DB,
    password: process.env.PASS_DB,
    database: process.env.DB,
    multipleStatements: false
});

var iswwclientConnect = false;
wwclient.on('qr', (qr)=>{
   qrcode.generate(qr, {small: true});
});
  
wwclient.on('ready', ()=>{
    iswwclientConnect = true;
    console.log("client connected");
});

app.use(bodyparser.json())
app.use(bodyparser.urlencoded({'extended': false}))
app.use(express.static('public'))

app.post('/api/otp', (req, res) => {
    if(iswwclientConnect) {
        if(req.body.id) {
            res.setHeader('Content-Type', 'application/json');
            pool.getConnection().then((conn) => {
                var otp = (Math.floor(Math.random() * 1000000) + 1000000).toString().substring(1);
                if (req.body.phone) {
                    const sanitized_number = req.body.phone.toString().replace(/[- )(]/g, "");
                    const final_number = `62${sanitized_number.substring(sanitized_number.length - 11)}`;
                    const numberId = wwclient.getNumberId(final_number).then((id) => {
                        if (id) {
                            var msg = otp + " Adalah kode konfirmasi Anda.";
                            var sendMsg = wwclient.sendMessage(id._serialized, msg).then((msg) => {
                                conn.query("SELECT COUNT(1) FROM user WHERE device_id= ? && phone= ?", [req.body.id, final_number]).then((rows) => {
                                    if (parseInt(rows[0]['COUNT(1)']) > 0) {
                                        res.json({
                                            'isAccepted': true,
                                            'info': "Message has been sent " + otp,
                                            'status-code': 1
                                        })
                                        return conn.query("UPDATE user SET otp= ? WHERE device_id= ? && phone= ?", [otp, req.body.id, final_number]);
                                    }else {
                                        conn.query("INSERT INTO user(id, device_id, phone, otp, token, state, ts) VALUES(NULL, ?, ?, ?, NULL, 0, CURRENT_TIMESTAMP)", [req.body.id, final_number, otp]).then(() => {
                                            res.json({
                                                'isAccepted': true,
                                                'info': "Message has been sent " + otp,
                                                'status-code': 1
                                            });
                                            conn.end();
                                        }).catch(err => {
                                            console.log(err)
                                            res.json({
                                                'isAccepted': false,
                                                'info': "Could not send message",
                                                'status-code': -2
                                            })
                                        });
                                    }
                                }).then(()=>{ conn.end() })
                            }).then(()=>{ conn.end() })
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
        ret.token = '-';
        const sanitized_number = req.body.phone.toString().replace(/[- )(]/g, "");
        const final_number = `62${sanitized_number.substring(sanitized_number.length - 11)}`;
        ret.phone = final_number
        if(req.body.id && req.body.otp) {
            res.setHeader('Content-Type', 'application/json');
            pool.getConnection().then((conn) => {
                conn.query("SELECT * FROM user WHERE otp= ? && device_id= ? && phone= ? ORDER BY ts DESC", [req.body.otp, req.body.id, final_number]).then((rows) => {
                    if (rows[0] !== undefined) {
                        ret.phone = rows[0].phone;
                        // const delta = deltaTs(conn, rows[0].id);
                        const user = { device_id: rows[0].device_id, phone: rows[0].phone };
                        const token = jwt.sign(user, process.env.TOKEN_SECRET);
                        ret.token = token;
                        return conn.query("DELETE FROM user WHERE device_id= ? && phone= ?", [req.body.id , final_number])
                    } else {
                        ret.isAccepted = false;
                        ret.info = "Otp not match or id not found";
                        ret.statusCode = -3
                        conn.end();
                    }
                }).then((rows) => {
                        ret.isAccepted = true;
                        ret.info = "User has been verified";
                        ret.statusCode = 2
                        conn.end();
                }).then(() => {
                    res.json({
                        "isAccepted": ret.isAccepted,
                        "info": ret.info,
                        "token": ret.token,
                        "phone": ret.phone,
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
app.listen(process.env.PORT);

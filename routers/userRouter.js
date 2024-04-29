const express = require('express');

const router = express.Router();
const { signUp, login, logOut, getOne, createPin } = require('../controllers/userController');
const authorization = require('../middleware/authorization');
const validation = require('../validation/validation');
// const upload = require('../utils/multer');

router.post('/signup', validation, signUp);

router.post('/login', login)

router.post('/logout', authorization, logOut);

router.get('/getone', authorization, getOne);

router.put('/createpin', authorization, createPin)

module.exports = router;   
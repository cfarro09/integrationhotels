const express = require('express');
const { GetHotelBeds, GetRatehawhotel, ExecAll } = require('../controllers/IntegrationController');
const router = express.Router()


router.get('/hotelbeds', GetHotelBeds)

router.get('/ratehaw', GetRatehawhotel)

router.get('/all', ExecAll)

module.exports = router
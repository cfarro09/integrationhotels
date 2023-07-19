const express = require('express');
const { GetHotelBeds, GetRatehawhotel } = require('../controllers/IntegrationController');
const router = express.Router()


router.get('/hotelbeds', GetHotelBeds)

router.get('/ratehaw', GetRatehawhotel)

module.exports = router
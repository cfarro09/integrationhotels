const express = require('express');
const { UpdateHotelRateHaw, ExecAll, BookingRateHaw, PreBookingRateHaw } = require('../controllers/IntegrationController');
const router = express.Router()

// router.get('/hotelbeds', GetHotelBeds)

// router.get('/ratehaw', GetRatehawhotel)

router.get('/all', ExecAll)

router.post('/update/ratehaw', UpdateHotelRateHaw)

router.post('/ratehaw/prebook', PreBookingRateHaw)

router.post('/ratehaw/book', BookingRateHaw)

module.exports = router
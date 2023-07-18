const express = require('express');
const { GetHotelBeds } = require('../controllers/IntegrationController');
const router = express.Router()

router.post('/hotelbeds', GetHotelBeds)

module.exports = router
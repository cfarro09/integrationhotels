const express = require('express');
const { GetHotelBeds } = require('../controllers/IntegrationController');
const router = express.Router()

router.get('/hotelbeds', GetHotelBeds)

module.exports = router
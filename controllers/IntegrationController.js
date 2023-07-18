const axios = require('axios')
const qs = require('qs')
const crypto = require('crypto');

exports.GetRatehawhotel = async (req, res) => {
    try {
        const data = {
            "inventory": "all",
            "language": "en"
        }
        const result = await axios({
            method: 'POST',
            url: 'https://api.worldota.net/api/b2b/v3/hotel/info/dump/',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic NDk4NDo0YzY2ODFhMi02NzY0LTQ1NmItYmI0NC02OTYxZDgyNGMxMWY=',
                'Cookie': 'uid=TfTb52S0PNlpw28gCFs7Ag=='
            },
            data: JSON.stringify(data)
        })
        return res.json(result.data)

    } catch (error) {
        return res.status(400).json({
            error: error
        })
    }

}


exports.GetRatehawhotelIncremental = async (req, res) => {
    try {
        const data = {
            "language": "en"
        }
        const result = await axios({
            method: 'POST',
            url: 'https://api.worldota.net/api/b2b/v3/hotel/info/incremental_dump/',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic NDk4NDo0YzY2ODFhMi02NzY0LTQ1NmItYmI0NC02OTYxZDgyNGMxMWY=',
                'Cookie': 'uid=TfTb52S0PNlpw28gCFs7Ag=='
            },
            data: JSON.stringify(data)
        })
        return res.json(result.data)

    } catch (error) {
        return res.status(400).json({
            error: error
        })
    }

}

exports.GetHotelBeds = async (req, res) => {
    try {
        const apiKey = "5869350eadd972f2fa41fe06b27473cd";
        const secret = "43e5240cf6";
        const currentDate = Math.floor(Date.now() / 1000);
        const inputString = apiKey + secret + currentDate;
        const sha256Hash = crypto.createHash('sha256').update(inputString).digest('hex');
        const Authorization = {
            'Api-key': apiKey,
            'X-Signature': sha256Hash,
            'Accept-Encoding': 'gzip',
            'Content-Type': 'application/json',
        }
        const fields = [
            "code", "name", "phones", "description", "city", "email", "address"
        ]

        const resultHotels = await axios({
            method: 'GET',
            url: `https://api.test.hotelbeds.com/hotel-content-api/1.0/hotels?fields=${fields.join(",")}`,
            headers: Authorization,
        })

        const dataHotels = resultHotels.data.hotels.map(x => ({
            code: x.code,
            name: x.name.content,
            description: x.description?.content,
            address: x.address?.content ?? "",
            city: x.city?.content,
            email: x.email,
            phone: x.phones?.length > 0 ? x.phones[0].phoneNumber : "",
            rooms: []
        }))

        if (dataHotels.length > 0) {
            const paramsRooms = {
                "stay": {
                    "checkIn": "2023-07-18",
                    "checkOut": "2023-07-19",
                },
                "occupancies": [
                    {
                        "rooms": 1,
                        "adults": 2,
                        "children": 0
                    }
                ],
                "hotels": {
                    "hotel": dataHotels.map(x => x.code)
                }
            }

            const resultRooms = await axios({
                method: 'POST',
                url: `https://api.test.hotelbeds.com/hotel-api/1.0/hotels?fields=rateKey,net`,
                headers: Authorization,
                data: JSON.stringify(paramsRooms)
            })

            const dataHotelRooms = resultRooms.data.hotels.hotels;

            for (const element of dataHotels) {
                element.rooms = dataHotelRooms.find(hotel => hotel.code === element.code)?.rooms.map(room => ({
                    ...room,
                    rates: room.rates.map(rate => ({
                        price: rate.net,
                        boardName: rate.boardName,
                        adults: rate.adults,
                        rateKey: rate.rateKey,
                    }))
                }))
            }
        }
        return res.json(dataHotels)


    } catch (error) {
        // console.log(error)
        return res.status(400).json(error)
    }

}

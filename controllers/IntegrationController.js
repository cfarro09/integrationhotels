const axios = require('axios')
const fs = require('fs');
const { writeFileAsync, deleteDir, readFile, decompressZstFile, getFechas } = require('../config/helpers');
const { connectBD, connectBD1 } = require('../config/databases');
const { authorizationHotelBed, getDestinationsSync, getRoutesSync } = require('../config/hotelbeds');
const apiKeyHotel = "5869350eadd972f2fa41fe06b27473cd";
const secretHotel = "43e5240cf6";
const apiKeyActivity = "5bc0c8c02f24d1db4d1e879fcac1f926";
const secretActivity = "588f045192";
const apiKeyTransfer = "ed1e79f7311ec6d82474f3c7762cf6b4";
const secretTransfer = "1614bf7b6a";
let XidHotel = 1;
let XidRoom = 1;
let XidRate = 1;

let XidActivity = 0;
let XidModality = 0;
let XidAmountsFrom = 0;

let connection = null;
let connection1 = null;

const executeQuery = (connection, query, parameters) => {
    return new Promise((resolve, reject) => {
        connection.query(query, parameters, (err, results) => {
            if (err) {
                console.error('Error al ejecutar el Stored Procedure:', err);
                reject(err);
                return;
            }
            resolve();
        });
    });
};

const closeConnection = async (connection) => {
    return new Promise((resolve, reject) => {
        connection.end((err) => {
            if (err) {
                console.error('Error al cerrar la conexión:', err);
                return;
            }
            resolve(connection)
        });
    })
}

const insertMassiveActivities = async (activities, modalities, amounts, deletet = false) => {
    // Llamar al Stored Procedure con parámetros
    const spName = 'ufn_activity_massive_insert';
    const parameter1 = JSON.stringify(activities);
    const parameter2 = JSON.stringify(modalities);
    const parameter3 = JSON.stringify(amounts);
    const parameter4 = deletet;
    const query = `CALL ${spName}(?, ?, ?, ?)`; // Usamos '?' como marcadores de posición para los parámetros

    await Promise.all([
        executeQuery(connection, query, [parameter1, parameter2, parameter3, parameter4]),
        executeQuery(connection1, query, [parameter1, parameter2, parameter3, parameter4]),
    ]);
}

const cleanData = async (data, proveedor, deletet = false) => {
    if (deletet) {
        XidHotel = 1;
        XidRoom = 1;
        XidRate = 1;
    }
    let hotels = data.map((hotel, index) => ({
        ...hotel,
        proveedor,
        id: (() => {
            XidHotel++;
            return XidHotel;
        })()
    }));

    let rooms1 = hotels.reduce((acc, item, indexHotel) => ([
        ...acc,
        ...(item.rooms?.map(room => ({
            ...room,
            hotelid: item.id
        })) ?? [])
    ]), []).map((room, index) => ({
        ...room, id: (() => {
            XidRoom++;
            return XidRoom;
        })()
    }));

    let rates = rooms1.reduce((acc, item) => ([
        ...acc,
        ...(item.rates?.map(rate => ({
            ...rate,
            roomid: item.id
        })) ?? [])
    ]), []).map((rate, index1) => ({
        ...rate, id: (() => {
            XidRate++;
            return XidRate;
        })()
    }))

    // Llamar al Stored Procedure con parámetros
    const spName = 'ufn_massive_insert';
    const parameter1 = JSON.stringify(hotels.map(x => ({ ...x, rooms: undefined })));
    const parameter2 = JSON.stringify(rooms1.map(x => ({ ...x, rates: undefined })));
    const parameter3 = JSON.stringify(rates);
    const parameter4 = deletet;

    const query = `CALL ${spName}(?, ?, ?, ?)`; // Usamos '?' como marcadores de posición para los parámetros
    data = null;
    hotels = null;
    rooms1 = null;
    rates = null;

    await Promise.all([
        executeQuery(connection, query, [parameter1, parameter2, parameter3, parameter4]),
        executeQuery(connection1, query, [parameter1, parameter2, parameter3, parameter4]),
    ]);
}

const processChunk = async (data) => {
    try {
        const listObj = data.split(/\n/);
        const lastText = listObj.pop();
        const jsonFormat = JSON.parse(`[${listObj.join(",")}]`);

        const transformData = jsonFormat.filter(hotel => hotel.name).map(hotel => ({
            code: null,
            name: hotel.name,
            
            check_in_time: hotel.check_in_time,
            check_out_time: hotel.check_out_time,
            floors_number: hotel.floors_number,
            rooms_number: hotel.rooms_number,
            year_built: hotel.year_built,
            year_renovated: hotel.year_renovated,
            latitude: hotel.latitude,
            currency: "",
            longitude: hotel.longitude,
            metapolicy_struct: JSON.stringify(hotel.metapolicy_struct),
            payment_methods: JSON.stringify(hotel.payment_methods),
            policy_struct: JSON.stringify(hotel.policy_struct),
            amenity_groups: JSON.stringify(hotel.amenity_groups),
            region_iata: hotel.region.iata,
            serp_filters: hotel.serp_filters?.join(","),
            interestpoints: "",
            destinationcode: "",
            address: hotel.address,
            email: hotel.email,
            star_rating: hotel.star_rating,
            phone: hotel.phone,
            images: hotel.images?.slice(0, 100).map(x => x.replace(/{size}/gi, '640x400')).join(","),
            city: hotel.region.name,
            description: JSON.stringify(hotel.description_struct),
            rooms: hotel.room_groups?.map((room) => ({
                images: room.images?.slice(0, 100).map(x => x.replace(/{size}/gi, '640x400')).join(","),
                code: room.room_group_id + "",
                room_amenities: room.room_amenities?.join(","),
                name: room.name,
                rates: [{
                    price: hotel.metapolicy_struct.check_in_check_out?.length > 0 ? hotel.metapolicy_struct.check_in_check_out[0].price : "",
                    adults: room.rg_ext.capacity,
                    rateKey: room.name,
                    boardName: room.name
                }]

            }))
        }))
        await cleanData(transformData, "ratehaw")
        return { lastText };
    } catch (error) {
        console.log(error)
        return { jsonFormat: [], lastText: "" };
    }
}

function readLargeFile(filePath) {
    let lastText1 = "";
    let bbb = 0;
    console.log(`reading... ${new Date()}`)
    return new Promise(async (resolve, reject) => {
        const readableStream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1024 * 1024 * 8 });

        for await (const chunk of readableStream) {
            const { lastText } = await processChunk(lastText1 + chunk);
            bbb = readableStream.bytesRead;
            lastText1 = lastText;
        }
        console.log(`finish reading... ${new Date()}`)
        resolve();
        // Evento de error: se dispara si ocurre algún error durante la lectura
        readableStream.on('error', (err) => {
            console.error('Error al leer el archivo:', err);
            reject(err);
        });
    });
}

const downloadAndSave = async (url, namefile) => {
    let response = await axios.get(url, { responseType: 'arraybuffer' });
    console.log("guardando")
    await writeFileAsync(namefile, response.data)
}

const getRatehawhotel = async () => {
    try {
        const data = {
            "inventory": "all",
            "language": "es"
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
        const url = result.data.data.url;

        const dir = "../files";
        fs.mkdirSync(dir, { recursive: true });

        const namefile = `${dir}/${new Date().getTime()}.json.zst`;
        console.log("descargando")

        await downloadAndSave(url, namefile)

        console.log("descomprimiendo")
        await decompressZstFile(namefile, namefile.replace(".zst", ""))

        await readLargeFile(namefile.replace(".zst", ""));
        // await readLargeFile("../files/1689817805567.json");
        deleteDir(dir)

        return { success: true }
    } catch (error) {
        return {
            error: error
        }
    }
}

const getTransfers = async (tokenTransfer, fechaActualUTC, fechaMananaUTC) => {
    await getRoutesSync(tokenTransfer)

    try {
        let routesJson = await readFile("../important/routes.json");
        routesJson = routesJson.filter(x => !!x.routes).reduce((acc, item) => [
            ...acc,
            ...item.routes
        ], []).slice(0, 10).map(x => ({
            "id": x,
            "dateTime": `${fechaActualUTC}T10:00:00`
        }));

        console.log("routesJson", routesJson)
        const ressss = await axios({
            method: 'POST',
            url: `https://api.test.hotelbeds.com/transfer-api/1.0/availability/routes/en/2/0/0`,
            headers: tokenTransfer,
            data: JSON.stringify(routesJson)
        })

        await writeFileAsync("../files/rrrrrr.json", JSON.stringify(ressss.data))

    } catch (error) {
        console.log("(error?.response?.data ?? { error })", (error?.response?.data))
        return { ...(error?.response?.data ?? { error }) };
    }
}

async function fetchActivitiesData(filters, fechaActualUTC, fechaMananaUTC, tokenActivities) {
    const fields = ["modalities", "amountsFrom", "rates", "amountsFrom", "media", "content"]
    const ressss = await axios({
        method: 'POST',
        url: `https://api.test.hotelbeds.com/activity-api/3.0/activities/availability?fields=${fields.join(",")}`,
        headers: tokenActivities,
        data: JSON.stringify({
            filters,
            "from": fechaActualUTC,
            "to": fechaMananaUTC,
            "paxes": [{
                "age": 30
            }],
            "language": "es",
            "pagination": {
                "itemsPerPage": 100,
                "page": 1
            },
        })
    });

    return ressss.data.activities;
}

const getDestinationsActivities = async (tokenActivities, fechaActualUTC, fechaMananaUTC) => {
    let destinations = (await readFile("../important/destinations.json")).filter(x => !!x.destinations).reduce((acc, item) => [
        ...acc,
        ...item.destinations
    ], []);

    try {
        const totalRequests = 12;
        // Realizar las solicitudes de manera asíncrona y almacenar las respuestas en activitiesAll
        const fetchPromises = Array.from({ length: totalRequests }, (_, i) => fetchActivitiesData(destinations.slice(i * 70, (i + 1) * 70).map(x => ({
            searchFilterItems: [{ "type": "destination", "value": x.code }]
        })), fechaActualUTC, fechaMananaUTC, tokenActivities));
        const responses = await Promise.all(fetchPromises);
        destinations = null;
        // Combinar todas las respuestas en un solo array
        const activitiesAll = responses.reduce((acc, data) => [...acc, ...data], []);

        let dataCleaned = activitiesAll.map(x => ({
            id: (() => ++XidActivity)(),
            country: x.country?.name,
            countrycode: x.country.code,
            currency: x.currencyName,
            description: x.content.description,
            name: x.name,   //NEW
            featuregroups: JSON.stringify(x.content.featureGroups), //NEW
            images: x.content?.media?.images?.slice(0, 100).map(images => images.urls.find(image => image.sizeType === "LARGE").resource).join(","),
            destinations: x.destinations?.length > 0 ? x.destinations[0].name : "",
            operationdays: x.operationDays?.map(x => x.name).join(","),
            modalities: x.modalities.map(y => ({
                id: (() => ++XidModality)(),
                activityid: XidActivity,
                ratedetails: JSON.stringify(x.rates?.[0]?.rateDetails ?? []), //NEW
                name: y.name,
                duration: `${y.duration.value} ${y.duration.metric}`,
                ratecode: y.rates.length > 0 ? y.rates[0].rateCode : "",
                ratename: y.rates.length > 0 ? y.rates[0].name : "",
                amounts: y.amountsFrom.map(z => ({
                    id: (() => ++XidAmountsFrom)(),
                    modalityid: XidModality,
                    paxType: z.paxType,
                    ageFrom: z.ageFrom,
                    ageTo: z.ageTo,
                    amount: z.amount,
                }))
            })),
        }));
        const activities = dataCleaned.map(x => ({ ...x, modalities: undefined }));
        let modalities = dataCleaned.reduce((acc, item) => [...acc, ...item.modalities], []);
        const amounts = modalities.reduce((acc, item) => [...acc, ...item.amounts], []);
        modalities = modalities.map(x => ({ ...x, amounts: undefined }));
        console.log("activities", activities.length)
        await insertMassiveActivities(activities, modalities, amounts, false);
    } catch (error) {
        console.log("(error?.response?.data ?? { error })", error, (error?.response?.data ?? { error }))
        return { ...(error?.response?.data ?? { error }) };
    }
}

const getHotelsBedsOnline = async (headers, fechaMananaUTC, fechaPasadoUTC) => {
    try {
        let datafacilities = (await axios({
            method: 'GET',
            url: `https://api.test.hotelbeds.com/hotel-content-api/1.0/types/facilities?from=1&to=1000`,
            headers
        }))
        const facilities = datafacilities.data.facilities.reduce((acc, item) => ({
            ...acc,
            [`${item.code}-${item.facilityGroupCode}`]: item.description?.content
        }),{})
    
        for (let ii = 0; ii < 20; ii++) {
            try {
                console.log(`running ${ii}`)
                let dataHotels = await axios({
                    method: 'GET',
                    url: `https://api.test.hotelbeds.com/hotel-content-api/1.0/hotels?from=${ii * 1000 + 1}&to=${(ii + 1) * 1000}`,
                    headers
                });
                dataHotels = dataHotels.data.hotels.map(x => ({
                    code: x.code,
                    name: x.name.content,
                    description: x.description?.content,
                    address: x.address?.content ?? "",
                    city: x.city?.content,
                    destinationcode: x.destinationCode,
                    check_in_time: "",
                    check_out_time: "",
                    floors_number: "",
                    rooms_number: "",
                    year_built: "",
                    year_renovated: "",
                    amenity_groups: "",
                    latitude: x.coordinates?.latitude,
                    longitude: x.coordinates?.longitude,
                    metapolicy_struct: "",
                    payment_methods: "",
                    policy_struct: "",
                    star_rating:  x.categoryCode?.replace(/[^\d]/g, "") ?? "0", //new
                    region_iata: "",
                    serp_filters: x.facilities?.map(x => facilities[`${x.facilityCode}-${x.facilityGroupCode}`]).join(","),
                    interestpoints : JSON.stringify(x.interestPoints),
                    images: x?.images?.slice(0, 100).map(x => `http://photos.hotelbeds.com/giata/bigger/${x.path}`).join(","),
                    email: x.email,
                    phone: x.phones?.length > 0 ? x.phones[0].phoneNumber : "",
                    rooms: []
                }))
                if (dataHotels.length > 0) {
                    const paramsRooms = {
                        "stay": {
                            "checkIn": fechaMananaUTC,
                            "checkOut": fechaPasadoUTC,
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
                        url: `https://api.test.hotelbeds.com/hotel-api/1.0/hotels`,
                        headers,
                        data: JSON.stringify(paramsRooms)
                    })
                    const dataHotelRooms = resultRooms.data.hotels.hotels;
    
                    for (const element of dataHotels) {
                        const hotelx = dataHotelRooms.find(hotel => hotel.code === element.code);
                        element.currency = hotelx?.currency;
                        element.rooms = hotelx?.rooms.map(room => ({
                            ...room,
                            images: "",
                            room_amenities: "",
                            rates: room.rates.map(rate => ({
                                price: rate.net,
                                boardName: rate.boardName,
                                adults: rate.adults,
                                rateKey: rate.rateKey,
                            }))
                        }))
                    }
                }
                await cleanData(dataHotels, "hotelbeds")
                console.log(`finish ${ii}`)
            } catch (error) {
                console.log(error)
                console.log("error on hotel bedonline!", ii)
            }
        }
    } catch (error) {
        console.log("error top hotelbed", error);
    }
}

const getHotelBeds = async (hotelstrigger = true) => {
    try {
        const { fechaActualUTC, fechaMananaUTC, fechaPasadoUTC } = getFechas();

        const tokenActivities = authorizationHotelBed(apiKeyActivity, secretActivity);
        const tokenTransfer = authorizationHotelBed(apiKeyTransfer, secretTransfer);
        const tokenHotel = authorizationHotelBed(apiKeyHotel, secretHotel);
        
        // getTransfers(tokenTransfer, fechaActualUTC, fechaMananaUTC);
        await Promise.all([
            getDestinationsActivities(tokenActivities, fechaMananaUTC, fechaPasadoUTC),
            getHotelsBedsOnline(tokenHotel, fechaMananaUTC, fechaPasadoUTC)
        ])

        return { success: true }
    } catch (error) {
        console.log(error?.response?.data || error)
        return { success: false }
    }
}

exports.ExecAll = async (req, res) => {
    console.log("searching integration!!")
    connection = await connectBD();
    connection1 = await connectBD1();

    await Promise.all([cleanData([], "", true), insertMassiveActivities([], [], [], true)]);

    await getHotelBeds();
    await getRatehawhotel();

    await Promise.all([closeConnection(connection), closeConnection(connection1)]);

    return res?.json({ resHotel: "", resRateHaw: "" }) || ""
}
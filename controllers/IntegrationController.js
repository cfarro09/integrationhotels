const axios = require('axios')
const fs = require('fs');
const { writeFileAsync, deleteDir, readFile, decompressZstFile } = require('../config/helpers');
const { connectBD, connectBD1 } = require('../config/databases');
const { authorizationHotelBed, getDestinationsSync, getRoutesSync } = require('../config/hotelbeds');
let XidHotel = 1;
let XidRoom = 1;
let XidRate = 1;

let XidActivity = 0;
let XidModality = 0;
let XidAmountsFrom = 0;

let connection = null;
let connection1 = null;

const insertMassiveActivities = async (activities, modalities, amounts, deletet = false) => {
    // Llamar al Stored Procedure con parámetros
    const spName = 'ufn_activity_massive_insert';
    const parameter1 = JSON.stringify(activities);
    const parameter2 = JSON.stringify(modalities);
    const parameter3 = JSON.stringify(amounts);
    const parameter4 = deletet;

    const query = `CALL ${spName}(?, ?, ?, ?)`; // Usamos '?' como marcadores de posición para los parámetros

    return new Promise((resolve, reject) => {
        connection.query(query, [parameter1, parameter2, parameter3, parameter4], (err, results) => {
            if (err) {
                console.error('Error al ejecutar el Stored Procedure:', err);
                return;
            }
            connection1.query(query, [parameter1, parameter2, parameter3, parameter4], (err, results) => {
                if (err) {
                    console.error('Error al ejecutar el Stored Procedure:', err);
                    return;
                }
                // Los resultados del SP se encuentran en 'results'
                console.log('Resultados del Stored Procedure:');
                resolve()
            });
        });
    })
}

const cleanData = async (data, proveedor, deletet = false) => {
    if (deletet) {
        XidHotel = 1;
        XidRoom = 1;
        XidRate = 1;
    }
    const hotels = data.map((hotel, index) => ({
        ...hotel,
        proveedor,
        id: (() => {
            XidHotel++;
            return XidHotel;
        })()
    }));

    const rooms1 = hotels.reduce((acc, item, indexHotel) => ([
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

    const rates = rooms1.reduce((acc, item) => ([
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

    return new Promise((resolve, reject) => {
        connection.query(query, [parameter1, parameter2, parameter3, parameter4], (err, results) => {
            if (err) {
                console.error('Error al ejecutar el Stored Procedure:', err);
                return;
            }
            // Los resultados del SP se encuentran en 'results'
            console.log('Resultados del Stored Procedure:');
            connection1.query(query, [parameter1, parameter2, parameter3, parameter4], (err, results) => {
                if (err) {
                    console.error('Error al ejecutar el Stored Procedure:', err);
                    return;
                }
                // Los resultados del SP se encuentran en 'results'
                console.log('Resultados del Stored Procedure:');
                resolve()
            });
        });
    })
}

const processChunk = (data) => {
    try {
        const listObj = data.split(/\n/);
        const lastText = listObj.pop();
        const jsonFormat = JSON.parse(`[${listObj.join(",")}]`);

        const transformData = jsonFormat.filter(hotel => hotel.name).map(hotel => ({
            code: null,
            name: hotel.name,
            address: hotel.address,
            email: hotel.email,
            phone: hotel.phone,
            images: hotel.images?.map(x => x.replace(/{size}/gi, '640x400')).join(","),
            city: "",
            description: (hotel.description_struct ?? []).length > 0 ? hotel.description_struct[0].paragraphs[0] : "",
            rooms: hotel.room_groups?.map((room) => ({
                code: room.room_group_id + "",
                name: room.name,
                rates: [{
                    price: hotel.metapolicy_struct.check_in_check_out?.length > 0 ? hotel.metapolicy_struct.check_in_check_out[0].price : "",
                    adults: room.rg_ext.capacity,
                    rateKey: room.name,
                    boardName: room.name
                }]

            }))
        }))
        cleanData(transformData, "ratehaw")

        return { lastText };
    } catch (error) {
        console.log(error)
        return { jsonFormat: [], lastText: "" };
    }
}

function readLargeFile(filePath) {
    let lastText1 = "";

    let index = 0;
    return new Promise((resolve, reject) => {
        const readableStream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1024 * 1024 * 8 });

        // Evento de datos: se dispara cuando se lee un chunk del archivo
        readableStream.on('data', (chunk) => {
            // Aquí puedes procesar el chunk leído, por ejemplo, imprimirlo en la consola
            const { lastText } = processChunk(lastText1 + chunk)
            lastText1 = lastText;
            // allData = jsonFormat //[...allData, ...jsonFormat];
            index++;
        });

        // Evento de finalización: se dispara cuando se ha leído todo el archivo
        readableStream.on('end', () => {
            resolve();
        });

        // Evento de error: se dispara si ocurre algún error durante la lectura
        readableStream.on('error', (err) => {
            console.error('Error al leer el archivo:', err);
            reject(err);
        });
    });
}

const getRatehawhotel = async () => {
    try {
        const data = {
            "inventory": "all",
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
        const url = result.data.data.url;

        const dir = "../files";
        fs.mkdirSync(dir, { recursive: true });

        const namefile = `${dir}/${new Date().getTime()}.json.zst`;
        const response = await axios.get(url, { responseType: 'arraybuffer' });

        await writeFileAsync(namefile, response.data)

        await decompressZstFile(namefile, namefile.replace(".zst", ""))

        await readLargeFile(namefile.replace(".zst", ""));
        // await readLargeFile("../files/1689817805567.json");

        deleteDir(dir)

        return { success: true }
    } catch (error) {
        // console.log(error)
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

const getDestinationsActivities = async (tokenActivities, fechaActualUTC, fechaMananaUTC) => {
    const destinationsoff = await readFile("../important/destinations.json");
    const destinations = destinationsoff.filter(x => !!x.destinations).reduce((acc, item) => [
        ...acc,
        ...item.destinations
    ], []);
    console.log("destinations", destinations.length)
    const fields = ["modalities", "amountsFrom", "rates", "amountsFrom", "media", "content"]
    try {
        let activitiesAll = [];
        for (let i = 0; i < 10; i++) {
            const ressss = await axios({
                method: 'POST',
                url: `https://api.test.hotelbeds.com/activity-api/3.0/activities/availability?fields=${fields.join(",")}`,
                headers: tokenActivities,
                data: JSON.stringify({
                    "filters": destinations.slice(i * 50, (i + 1) * 50).map(x => ({
                        searchFilterItems: [{ "type": "destination", "value": x.code }]
                    })),
                    "from": fechaMananaUTC,
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
            activitiesAll = [...activitiesAll, ...ressss.data.activities]
        }
        let dataCleaned = activitiesAll.map(x => ({
            id: (() => ++XidActivity)(),
            country: x.country?.name,
            countrycode: x.country.code,
            currency: x.currencyName,
            description: x.content.description,
            images: x.content?.media?.images?.map(images => images.urls.find(image => image.sizeType === "LARGE").resource).join(","),
            destinations: x.destinations?.length > 0 ? x.destinations[0].name : "",
            operationdays: x.operationDays?.map(x => x.name).join(","),
            modalities: x.modalities.map(y => ({
                id: (() => ++XidModality)(),
                activityid: XidActivity,
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
        console.log(error)
        console.log("(error?.response?.data ?? { error })", (error?.response?.data ?? { error }))
        return { ...(error?.response?.data ?? { error }) };
    }
}

const getHotelBeds = async (hotelstrigger = true) => {
    try {
        const fechaActual = new Date();
        const fechaManana = new Date();
        const fechapasado = new Date();

        // Agregar un día para obtener la fecha de mañana
        fechaManana.setDate(fechaManana.getDate() + 1);
        fechapasado.setDate(fechapasado.getDate() + 2);

        // Obtener las partes de la fecha en UTC
        const fechaActualUTC = fechaActual.toISOString().slice(0, 10);
        const fechaMananaUTC = fechaManana.toISOString().slice(0, 10);
        const fechaPasadoUTC = fechapasado.toISOString().slice(0, 10);

        const apiKey = "5869350eadd972f2fa41fe06b27473cd";
        const secret = "43e5240cf6";

        const apiKeyActivity = "5bc0c8c02f24d1db4d1e879fcac1f926";
        const secretActivity = "588f045192";

        const apiKeyTransfer = "ed1e79f7311ec6d82474f3c7762cf6b4";
        const secretTransfer = "1614bf7b6a";

        const tokenActivities = authorizationHotelBed(apiKeyActivity, secretActivity);
        const tokenTransfer = authorizationHotelBed(apiKeyTransfer, secretTransfer);
        const fields = ["code", "name", "phones", "description", "city", "email", "address", "images"]


        getDestinationsActivities(tokenActivities, fechaActualUTC, fechaMananaUTC);

        // getTransfers(tokenTransfer, fechaActualUTC, fechaMananaUTC);

        if (hotelstrigger) {
            const resultHotels = await axios({
                method: 'GET',
                url: `https://api.test.hotelbeds.com/hotel-content-api/1.0/hotels?fields=${fields.join(",")}`,
                headers: authorizationHotelBed(apiKey, secret),
            })

            const dataHotels = resultHotels.data.hotels.map(x => ({
                code: x.code,
                name: x.name.content,
                description: x.description?.content,
                address: x.address?.content ?? "",
                city: x.city?.content,
                images: x.images.map(x => `http://photos.hotelbeds.com/giata/bigger/${x.path}`).join(","),
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
                    headers: authorizationHotelBed(apiKey, secret),
                    data: JSON.stringify(paramsRooms)
                })

                const dataHotelRooms = resultRooms.data.hotels.hotels;
                console.log("resultRooms.data.hotels", resultRooms.data.hotels.hotels.length)
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
            await cleanData(dataHotels, "hotelbeds")
        }
        return { success: true }


    } catch (error) {
        console.log(error?.response?.data || error)
        return { success: false }
    }
}


exports.GetRatehawhotel = async (req, res) => {
    const rr = await getRatehawhotel();
    return res.json(rr)
}

exports.GetHotelBeds = async (req, res) => {
    const rr = await getHotelBeds();
    return res.json(rr)
}

exports.ExecAll = async (req, res) => {
    console.log("searching integration!!")
    connection = await connectBD();
    connection1 = await connectBD1();

    await cleanData([], "", true)
    await insertMassiveActivities([], [], [], true);

    const resHotel = await getHotelBeds();
    const resRateHaw = await getRatehawhotel();

    // Cerrar la conexión después de obtener los resultados
    setTimeout(() => {
        connection.end((err) => {
            if (err) {
                console.error('Error al cerrar la conexión:', err);
                return;
            }
            console.log('Conexión cerrada.');
        });
        connection1.end((err) => {
            if (err) {
                console.error('Error al cerrar la conexión1:', err);
                return;
            }
            console.log('Conexión cerrada.');
        });
    }, 600000);

    return res?.json({ resHotel, resRateHaw: "" }) || ""
}
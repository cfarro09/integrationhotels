const axios = require('axios')
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { exec } = require('child_process')
const mysql = require('mysql2');
let XidHotel = 1;
let XidRoom = 1;
let XidRate = 1;
function decompressZstFile(filePath, output) {
    return new Promise((resolve, reject) => {
        exec(`unzstd ${filePath} -o ${output}`, (error, stdout, stderr) => {
            if (error) {
                console.warn(error);
                reject(error);
            }
            resolve(stdout ? stdout : stderr);
        });
    });
}

function writeFileAsync(filePath, data) {
    return new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(filePath);

        // Evento de escritura finalizada
        writeStream.on('finish', () => {
            resolve();
        });

        writeStream.on('error', (err) => {
            reject(err);
        });
        writeStream.write(data);

        writeStream.end();
    });
}

function deleteDir(filePath) {
    const files = fs.readdirSync(filePath);

    for (const file of files) {
        const currentPath = path.join(filePath, file);

        if (fs.lstatSync(currentPath).isDirectory()) {
            // Si es un subdirectorio, eliminarlo de manera recursiva
            removeDirRecursive(currentPath);
        } else {
            // Si es un archivo, eliminarlo
            fs.unlinkSync(currentPath);
        }
    }

    // Después de eliminar todos los archivos y subdirectorios, eliminar el directorio actual
    fs.rmdirSync(filePath);
}
let connection = null;
const connectBD = () => {
    return new Promise((resolve, reject) => {
        const connection1 = mysql.createConnection({
            host: '89.117.72.104',
            user: 'tu_usuario',
            password: 'tu_contrasena',
            database: 'crmenjoy',
        });

        connection1.connect((err) => {
            if (err) {
                console.error('Error al conectarse a la base de datos:', err);
                return;
            }
            resolve(connection1)
            console.log('¡Conexión a MySQL exitosa!');
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
            resolve()
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


const getHotelBeds = async () => {
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
            "code", "name", "phones", "description", "city", "email", "address", "images"
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
            images: x.images.map(x => `http://photos.hotelbeds.com/giata/bigger/${x.path}`),
            email: x.email,
            phone: x.phones?.length > 0 ? x.phones[0].phoneNumber : "",
            rooms: []
        }))

        const fechaActual = new Date();
        const fechaManana = new Date();

        // Agregar un día para obtener la fecha de mañana
        fechaManana.setDate(fechaManana.getDate() + 1);

        // Obtener las partes de la fecha en UTC
        const fechaActualUTC = fechaActual.toISOString().slice(0, 10);
        const fechaMananaUTC = fechaManana.toISOString().slice(0, 10);


        if (dataHotels.length > 0) {
            const paramsRooms = {
                "stay": {
                    "checkIn": fechaActualUTC,
                    "checkOut": fechaMananaUTC,
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
                headers: Authorization,
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
    connection = await connectBD();

    await cleanData([], "", true)

    const resHotel = await getHotelBeds();
    const resRateHaw = await getRatehawhotel();

    // Cerrar la conexión después de obtener los resultados
    connection.end((err) => {
        if (err) {
            console.error('Error al cerrar la conexión:', err);
            return;
        }
        console.log('Conexión cerrada.');
    });

    return res?.json({ resHotel, resRateHaw }) || ""
}
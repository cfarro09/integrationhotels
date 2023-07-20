const axios = require('axios')
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { exec } = require('child_process')

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

const processChunk = (data) => {
    try {
        const listObj = data.split(/\n/);
        const lastText = listObj.pop();
        const jsonFormat = JSON.parse(`[${listObj.join(",")}]`);
    
        const transformData = jsonFormat.filter(hotel => hotel.name).map((hotel, iHotel) => ({
            id: iHotel + 1,
            code: null,
            name: hotel.name,
            address: hotel.address,
            email: hotel.email,
            phone: hotel.phone,
            city: "",
            description: (hotel.description_struct ?? []).length > 0 ? hotel.description_struct[0].paragraphs[0] : "",
            rooms: hotel.room_groups?.map((room, iRoom) => ({
                id: iHotel + iRoom + 1,
                code: room.room_group_id + "",
                name: room.name,
                rates: [{
                    id: iHotel + iRoom + 1,
                    price: hotel.metapolicy_struct.check_in_check_out.price,
                    adults: room.rg_ext.capacity,
                    rateKey: room.name,
                    boardName: room.name
                }]
    
            }))
        }))
        return { jsonFormat: transformData, lastText };
    } catch (error) {
        console.log("texto", data)
        return { jsonFormat: [], lastText: "" };
    }
}

function readLargeFile(filePath) {
    let lastText1 = "";
    let allData = [];
    let index = 0;
    return new Promise((resolve, reject) => {
        const readableStream = fs.createReadStream(filePath, { encoding: 'utf8' });

        // Evento de datos: se dispara cuando se lee un chunk del archivo
        readableStream.on('data', (chunk) => {
            // Aquí puedes procesar el chunk leído, por ejemplo, imprimirlo en la consola
            if (index === 0) {
                const { lastText, jsonFormat } = processChunk(lastText1 + chunk)
                lastText1 = lastText;
                allData = jsonFormat //[...allData, ...jsonFormat];
            }
            index++;
        });

        // Evento de finalización: se dispara cuando se ha leído todo el archivo
        readableStream.on('end', () => {
            resolve(allData);
        });

        // Evento de error: se dispara si ocurre algún error durante la lectura
        readableStream.on('error', (err) => {
            console.error('Error al leer el archivo:', err);
            reject(err);
        });
    });
}

exports.GetRatehawhotel = async (req, res) => {
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

        // const url = "https://partner-feedora.s3.eu-central-1.amazonaws.com/af/feed_en.json.zst"
        const dir = "../files";
        fs.mkdirSync(dir, { recursive: true });

        const namefile = `${dir}/${new Date().getTime()}.json.zst`;
        const response = await axios.get(url, { responseType: 'arraybuffer' });

        await writeFileAsync(namefile, response.data)

        await decompressZstFile(namefile, namefile.replace(".zst", ""))

        const data1 = await readLargeFile(namefile.replace(".zst", ""))

        deleteDir(dir)
        return res.json(data1)

    } catch (error) {
        console.log(error)
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
                url: `https://api.test.hotelbeds.com/hotel-api/1.0/hotels`,
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

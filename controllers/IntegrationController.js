const axios = require('axios')
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const ZstdCodec = require('zstd-codec').ZstdCodec;

const initzstd = async () => {
    return new Promise((resolve, reject) => {
        ZstdCodec.run(zstd => {
            const streaming = new zstd.Streaming();
            resolve(streaming)

        });
    })
}

const unzipZstFileInBlocks = async (uint8Array, initialBlockSize = 512) => {
    const streaming = await initzstd();

    try {
        let offset = 0;
        let blockSize = initialBlockSize;

        while (offset < uint8Array.length) {
            // Calcular el tamaño del bloque actual
            const currentBlockSize = Math.min(blockSize, uint8Array.length - offset);

            // Descomprimir el bloque actual
            const compressedBlock = uint8Array.slice(offset, offset + currentBlockSize);
            console.log("compressedBlock", compressedBlock)
            const uncompressedBlock = streaming.decompress(compressedBlock);

            // Procesar el bloque descomprimido aquí
            console.log('Procesando bloque:', uncompressedBlock);

            // Incrementar el desplazamiento para el siguiente bloque
            offset += currentBlockSize;
        }
    } catch (error) {
        console.error('Error al descomprimir los bloques:', error);
    }
};

const downloadFile = async (url) => {
    const rootDir = path.resolve(__dirname); // Obtiene la ruta del directorio raíz del proyecto
    const destination = `${new Date().toISOString()}.zst`;
    const zstFilePath = path.join(rootDir, "..", destination);

    console.log("downloading...")
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'arraybuffer', // Important: This ensures the response is treated as binary data
    });

    const compressedData = new Uint8Array(response.data);
    console.log("unziping...")

    unzipZstFileInBlocks(compressedData, 1024)
        .then((blocks) => {
            console.log("blocks", blocks)
            console.log('Bloques descomprimidos:', blocks.length);
            // Procesar cada bloque individualmente o guardarlos en archivos según tus necesidades.
        })
        .catch((error) => {
            console.error(error);
        });
    // const uncompressedData = zstd.(compressedData);

    // const absoluteDestination = path.resolve(zstFilePath);

    // // Crear el directorio (si no existe) antes de guardar el archivo
    // const destinationDir = path.dirname(absoluteDestination);
    // fs.mkdir(destinationDir, { recursive: true });

    // console.log("downloaded..", absoluteDestination);

    // // Utilizar fs.writeFile en lugar de fs.writeFileSync para escribir el buffer en el archivo
    // fs.writeFile(absoluteDestination, uncompressedData);

};

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
        await downloadFile(url, `${new Date().toISOString()}.zst`)
        return res.json(result.data.data.url)

    } catch (error) {
        console.log(error)
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

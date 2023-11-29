const fs = require('fs');
const path = require('path');
const { exec } = require('child_process')

exports.writeFileAsync = async (filePath, data) => {
    console.log("guardando!")
    return new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(filePath);

        // Evento de escritura finalizada
        writeStream.on('finish', () => {
            resolve();
        });

        writeStream.on('error', (err) => {
            console.log("guardando err", err)
            reject(err);
        });
        writeStream.write(data);

        writeStream.end();
    });
}

exports.deleteDir = (filePath) => {
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

exports.readFile = async (path) => {
    return new Promise((resolve, reject) => {
        // fs.readFile("countries.json", 'utf8', (err, data) => {
        fs.readFile(path, 'utf8', (err, data) => {
            if (err) {
                console.error('Error reading the file:', err);
                reject(err)
            }
            try {
                const jsonData = JSON.parse(data);
                resolve(jsonData)
            } catch (parseError) {
                reject(parseError)
            }
        });
    })
}

exports.decompressZstFile = async (filePath, output) => {
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

exports.getFechas = () => {
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

    return { fechaActualUTC, fechaMananaUTC, fechaPasadoUTC };
}
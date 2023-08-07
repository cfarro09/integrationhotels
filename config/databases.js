const mysql = require('mysql2');

exports.connectBD = async () => {
    return new Promise((resolve, reject) => {
        const connection1 = mysql.createConnection({
            host: '89.117.72.1014',
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
        });
    })
}

exports.connectBD1 = async () => {
    return new Promise((resolve, reject) => {
        const connection1 = mysql.createConnection({
            host: '89.117.72.12m04',
            user: 'tu_usuario',
            password: 'tu_contrasena',
            database: 'crmenjoyperu',
        });

        connection1.connect((err) => {
            if (err) {
                console.error('Error al conectarse a la base de datos:', err);
                return;
            }
            resolve(connection1)
        });
    })
}
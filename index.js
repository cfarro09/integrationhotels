require('dotenv').config();
const cron = require('node-cron');

const express = require('express');
const cors = require('cors');
const { ExecAll } = require('./controllers/IntegrationController');

const app = express();

app.use(cors({}));

app.use(express.json({ limit: '100mb' }));//to accept json
app.use(express.static('public'));


app.use('/api/integration', require('./routes/integration'));

// Definir la pagina principal
app.get('/', (req, res) => {
	res.send('Welcome my API 2');
});
// Arrancar la app
const PORT = process.env.PORT || 6065;
app.listen(PORT, '0.0.0.0', () => {
})

console.log(`Corriendo en http://localhost:${PORT}`);

// Patrón cron para que se ejecute a las 10:00 PM todos los días (hora 22, minuto 0)
const patronCron = '0 23 * * *';

cron.schedule(patronCron, () => {
	console.log("new Date()", new Date().toISOString());
	ExecAll()
});

// ExecAll()
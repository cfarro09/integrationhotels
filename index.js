require('dotenv').config();
const express = require('express');
const cors = require('cors');

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
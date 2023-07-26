const crypto = require('crypto');
const axios = require('axios');
const { writeFileAsync, readFile } = require('./helpers');

exports.authorizationHotelBed = (apiKey, secret) => {
    const currentDate = Math.floor(Date.now() / 1000);
    const inputString = apiKey + secret + currentDate;
    const sha256Hash = crypto.createHash('sha256').update(inputString).digest('hex');
    return {
        'Api-key': apiKey,
        'X-Signature': sha256Hash,
        'Accept-Encoding': 'gzip',
        'Content-Type': 'application/json',
    }
}

const getDestinations = async (token, country) => {
    try {
        const ressss = await axios({
            method: 'GET',
            url: `https://api.test.hotelbeds.com/activity-content-api/3.0/destinations/en/${country}`,
            headers: token,
        })

        return { country, ...(ressss.data.country ?? {}) };
    } catch (error) {
        console.log("(error?.response?.data ?? { error })", (error?.response?.data ?? { error }))
        return { country, ...(error?.response?.data ?? { error }) };
    }
}

const getRoutes = async (token, code) => {
    try {
        const ressss = await axios({
            method: 'GET',
            url: ` https://api.test.hotelbeds.com/transfer-cache-api/1.0/routes?fields=code,from,to&destinationCode=${code}`,
            headers: token,
        })
        
        return { code, routes: ressss.data?.map(x => x.code) ?? [] };
    } catch (error) {
        console.log("(error?.response?.data ?? { error })", (error?.response?.data))
        return { code, ...(error?.response?.data ?? { error }) };
    }
}

exports.getDestinationsSync = async (tokenActivities) => {
    const countries = await readFile("../files/destinations.json");

    console.log("to search!", countries.filter(x => !x.destinations).length)
    const resCountries = await Promise.all(countries.filter(x => !x.destinations).map(x => getDestinations(tokenActivities, x.country)));

    const dataaa = resCountries.filter(x => !!x.destinations).reduce((acc, item) => ({
        ...acc,
        [item.country]: item
    }), {})

    console.log("found!", Object.keys(dataaa).length)

    for (let ii = 0; ii < countries.length; ii++) {
        if (dataaa[countries[ii].country]) {
            countries[ii] = dataaa[countries[ii].country];
        }
    }

    await writeFileAsync("../files/destinations.json", JSON.stringify(countries))
}


exports.getRoutesSync = async (tokenTransfer) => {
    const destinationsoff = await readFile("../important/destinations.json");
    const destinations = destinationsoff.filter(x => !!x.destinations).reduce((acc, item) => [
        ...acc,
        ...item.destinations
    ], []);

    const resCountries = await Promise.all(destinations.slice(0, 100).map(x => getRoutes(tokenTransfer, x.code)));

    // const dataaa = resCountries.filter(x => !!x.destinations).reduce((acc, item) => ({
    //     ...acc,
    //     [item.country]: item
    // }), {})

    await writeFileAsync("../important/routes.json", JSON.stringify(resCountries))
}
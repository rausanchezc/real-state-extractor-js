const axios = require('axios');
const playwright = require('playwright');
const cheerio = require('cheerio');

console.log('Proxy Username: ' , process.env.PROXY_USERNAME);
console.log('Proxy Password: ' , process.env.PROXY_PASSWORD);
console.log('Proxy Port:', process.env.PROXY_PORT);
console.log('Proxy IPS:', process.env.PROXY_IPS);

const url = 'https://www.idealista.com/inmueble/94892105/';
const useHeadless = true; // "true" to use playwright
const maxVisits = 30; // Arbitrary number for the maximum of links visited
const visited = new Set();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const getProxyIP = () => {
    const ips = process.env.PROXY_IPS.split(',');
    return ips[Math.floor(Math.random() * ips.length)];
}

const getHtmlPlaywright = async url => {

    const browser = await playwright.firefox.launch({
        proxy: {
            server: `http://${getProxyIP()}:${process.env.PROXY_PORT}`,
            username: process.env.PROXY_USERNAME,
            password: process.env.PROXY_PASSWORD
        }
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url);
    const html = await page.content();
    await browser.close();

    return html;
};

const getHtmlAxios = async url => {
    const { data } = await axios.get(url);

    return data;
};

const getHtml = async url => {
    return useHeadless ? await getHtmlPlaywright(url) : await getHtmlAxios(url);
};

const extractContent = $ => {

    const platformId = extractPlatformId(url); // FIXME using global variable
    const agencyId = extractAgencyId($);
    const title = extractTitle($);
    const description = extractDescription($);
    const price = extractPrice($);
    const details = extractDetails($);
    const lastUpdate = extractLastUpdate($);
    const location = extractLocation($);

    return {
        platformId,
        agencyId,
        title,
        description,
        price,
        details,
        lastUpdate,
        location
    }
}

const extractPrice = $ => {
    const prices = $('.price-features__container .flex-feature-details')
        .map((_, price) => $(price).text())
        .toArray();
    return { price: prices[1], priceSquareMeter: prices[3] }
};

const extractDescription = $ => $('div.comment p').first().text().trim()

const extractDetails = $ => $('div.details-property_features li').map((_, detail) => $(detail).text().trim()).toArray()

const extractLastUpdate = $ => $('p.stats-text').first().text()

const extractLocation = $ => $('div#headerMap li.header-map-list').map((_, loc) => $(loc).text().trim()).toArray()

const extractAgencyId = $ => {
    const agencyLabel = $('p.txt-ref').first().text().trim();
    return agencyLabel.substr(agencyLabel.lastIndexOf(':') + 1, agencyLabel.length);
}

const extractTitle = $ => $('h1 span.main-info__title-main').first().text()

const extractPlatformId = (urlParam) => {
    const urlLength = urlParam.length;
    const url = urlParam.substr(0, urlLength - 1);
    return url.substr(url.lastIndexOf('/') + 1, urlLength);
}

const crawl = async url => {
    visited.add(url);
    console.log('Crawl: ', url);
    const html = await getHtml(url);
    const $ = cheerio.load(html);
    const content = extractContent($);
    console.log(content);
};

// Change the default concurrency or pass it as param
const queue = (concurrency = 4) => {
    let running = 0;
    const tasks = [];

    return {
        enqueue: async (task, ...params) => {
            tasks.push({ task, params });
            if (running >= concurrency) {
                return;
            }

            ++running;
            while (tasks.length) {
                const { task, params } = tasks.shift();
                await task(...params);
            }
            --running;
        },
    };
};

const crawlTask = async url => {
    if (visited.size >= maxVisits) {
        console.log('Over Max Visits, exiting');
        return;
    }

    if (visited.has(url)) {
        return;
    }

    await crawl(url);
};

const q = queue();
q.enqueue(crawlTask, url);
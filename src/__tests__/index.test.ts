import * as Express from "express"
import * as Http from "http"
import { JSDOM } from "jsdom"
import { MongoMemoryServer } from "mongodb-memory-server"
import * as Mongoose from "mongoose"
import fetch from "node-fetch"
import Minimalytics from ".."

const SERVER_PORT = 7777
const USERNAME = "test_user"
const PASSWORD = "test_pass"

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

let expressApp: Express.Application | undefined = undefined
let mongoMemoryServer: MongoMemoryServer | undefined = undefined
let mongooseConnection: Mongoose.Mongoose | undefined = undefined
let minimalytics: Minimalytics | undefined = undefined

beforeAll(async (done) => {
    expressApp = Express()

    mongoMemoryServer = new MongoMemoryServer()
    mongooseConnection = await Mongoose.connect(await mongoMemoryServer.getUri())

    const server = Http.createServer(expressApp)
    server.listen(SERVER_PORT, () => {
        console.log(`Running server on port ${SERVER_PORT}`)

        done()
    })

    minimalytics = Minimalytics.init({
        express: expressApp!,
        mongoose: mongooseConnection!,
        username: USERNAME,
        password: PASSWORD,
        collection: "logs",
        debug: true
    })

    expressApp.get("/test", (_: Express.Request, res: Express.Response) => {
        res.status(200).json({ success: true })
    })
}, 20 * 1000)

test("Make HTTP request", async () => {
    const res = await fetch(`http://localhost:${SERVER_PORT}/test`)
    const json = await res.json()

    expect(json.success).toBe(true)
})

test(
    "Log visit",
    async () => {
        // Wait for MongoDB insertion
        await sleep(1000)

        const result = await minimalytics!.logModel.find({})
        expect(result.length).toBeGreaterThan(0)
    },
    6 * 1000
)

test(
    "Insert mock data",
    async () => {
        const getRandomInt = (min: number, max: number) => {
            min = Math.ceil(min)
            max = Math.floor(max)
            return Math.floor(Math.random() * (max - min)) + min
        }

        const generateMockIp = () =>
            Math.floor(Math.random() * 255) +
            1 +
            "." +
            Math.floor(Math.random() * 255) +
            "." +
            Math.floor(Math.random() * 255) +
            "." +
            Math.floor(Math.random() * 255)

        const generateMockTimestamp = () => {
            const now = new Date().getTime()
            const random = now - getRandomInt(1, 60 * 1000 * 60 * 24 * 90)
            return random
        }

        const generateMockCountry = () => {
            const countries = [
                "United Kingdom",
                "Italy",
                "Norway",
                "United States of America",
                "Panama",
                "Peru",
                "Slovakia",
                "Slovenia",
                "Ukraine",
                "Philippines",
                "Monaco",
                "Jamaica",
                "Iceland",
                "Ireland",
                "Guinea",
                "Algeria",
                "Cuba"
            ]
            return countries[Math.floor(Math.random() * countries.length)]
        }

        const data: Array<any> = new Array(5000).fill(0).map(() => ({
            ip: generateMockIp(),
            timestamp: generateMockTimestamp(),
            country: generateMockCountry()
        }))

        await minimalytics!.logModel.insertMany(data)

        const numOfItems = await minimalytics!.logModel.countDocuments()
        expect(numOfItems).toBe(data.length + 1)
    },
    20 * 1000
)

test("Render Dashboard", async () => {
    const res = await fetch(`http://localhost:${SERVER_PORT}/analytics`, {
        headers: {
            Authorization: "Basic " + btoa(`${USERNAME}:${PASSWORD}`)
        }
    })
    const html = await res.text()

    const dom = new JSDOM(html)
    const title = dom.window.document.querySelector("h1")?.textContent
    expect(title).toBe("Minimalytics")
})

test("Dashboard access is protected", async () => {
    const res = await fetch(`http://localhost:${SERVER_PORT}/analytics`)
    const text = await res.text()

    expect(text).toBe("Authentication required.")
})

afterAll(() => {
    mongoMemoryServer?.stop?.()
})

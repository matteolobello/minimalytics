import * as Express from "express"
import * as GeoIp from "geoip-lite"
import * as IpAnonymize from "ip-anonymize"
import * as Mongoose from "mongoose"
import { createLogModel, ILog } from "./db/LogSchema"
import * as fs from "fs"
import * as Mustache from "mustache"
import * as countryEmoji from "country-emoji"

interface MinimalyticsOpt {
    express: Express.Application
    mongoose: Mongoose.Mongoose

    // Basic Auth credentials
    username: string
    password: string

    // The name of the MongoDB collection
    collection: string

    // Consider a new visit valid for an IP
    // only after this amount of time
    deltaMs?: number

    // Include only selected request paths
    validPaths?: Array<string | RegExp>

    // Enable console logs
    debug?: boolean
}

class Minimalytics {
    private static readonly TAG = "[Minimalytics]"

    private static instance: Minimalytics

    private opt: MinimalyticsOpt

    readonly logModel: Mongoose.Model<ILog>

    public static init(opt: MinimalyticsOpt) {
        if (Minimalytics.instance) {
            throw Error("You must initialize Minimalytics only once")
        }

        Minimalytics.instance = new Minimalytics(opt)
        return Minimalytics.instance
    }

    private constructor(opt: MinimalyticsOpt) {
        this.opt = opt

        if (!this.opt.deltaMs) {
            this.opt.deltaMs = 60 * 1000
        }

        this.logModel = createLogModel(opt.mongoose, opt.collection)

        this.handleBasicAuthRequests()
        this.handleAnalyticsDashboardRequests()

        // Put the `use` hook below the GET /analytics routes to avoid tracking them
        this.opt.express.use((req: Express.Request, res: Express.Response, next: Express.NextFunction) => {
            this.use(req, res, next)
        })
    }

    private async use(req: Express.Request, res: Express.Response, next: Express.NextFunction) {
        // Do not block the request while logging
        next()

        if (this.opt.validPaths) {
            let isValidPath = false
            for (const validPath of this.opt.validPaths) {
                if (validPath instanceof RegExp) {
                    if (validPath.test(req.path)) {
                        isValidPath = true
                        break
                    }
                } else {
                    if (validPath === req.path) {
                        isValidPath = true
                        break
                    }
                }
            }

            if (!isValidPath) {
                return this.log(`Not logging request at path "${req.path}"`)
            }
        }

        const ip = req.ip.toString?.()?.replace?.("::ffff:", "")
        if (!ip) {
            return this.log(`Could not get the IP of the client`)
        }

        const isLocalHost = ip === "127.0.0.1"
        if (isLocalHost && !this.opt.debug) {
            return this.log(`Excluding requests from localhost`)
        }

        const anonymizedIp = IpAnonymize(ip)
        if (!anonymizedIp) {
            return this.log(`Could not anonymize IP "${ip}"`)
        }

        const avoidAddingNewLog = await this.logModel.exists({
            $and: [
                { ip: anonymizedIp },
                {
                    timestamp: {
                        $gte: new Date(Date.now() - this.opt.deltaMs!)
                    }
                }
            ]
        })
        if (avoidAddingNewLog) {
            this.log(`Client already made a request less than ${this.opt.deltaMs!}ms ago`)
            return
        }

        let country = GeoIp.lookup(ip)?.country
        if (!country) {
            if (isLocalHost && !this.opt.debug) {
                return this.log(`Could not get country for IP "${ip}"`)
            }

            country = "United States of America"
        }

        this.logModel.create({
            ip: anonymizedIp,
            timestamp: new Date().getTime(),
            country
        })

        this.log("Adding request log")
    }

    private handleBasicAuthRequests() {
        this.opt.express.use((req: Express.Request, res: Express.Response, next: Express.NextFunction) => {
            if (!req.path.startsWith("/analytics")) {
                this.log("Received a non-analytics request", req.path)
                return next()
            }

            const denyAccess = () => {
                this.log("Denying access to analytics dashboard")

                res.set("WWW-Authenticate", 'Basic realm="401"')
                res.status(401).send("Authentication required.")
            }

            try {
                const b64auth = (req.headers.authorization || "").split(" ")[1] || ""
                const [username, password] = Buffer.from(b64auth, "base64").toString().split(":")

                const areCredentialsValid =
                    username && password && username === this.opt.username && password === this.opt.password
                if (areCredentialsValid) {
                    next()
                } else {
                    denyAccess()
                }
            } catch {
                denyAccess()
            }
        })
    }

    private async handleAnalyticsDashboardRequests() {
        const mustacheTemplateHtml = fs.readFileSync(`${__dirname}/mustache/analytics.mustache`).toString()

        this.opt.express.get("/analytics", async (_: Express.Request, res: Express.Response) => {
            const todayViews = await this.getTodayViews()
            const thisMonthViews = await this.getThisMonthViews()
            const totalViews = await this.getTotalViews()
            const viewsGroupedByCountry = await this.getViewsGroupedByCountry()

            res.status(200).send(
                Mustache.render(mustacheTemplateHtml, {
                    todayViews,
                    thisMonthViews,
                    totalViews,
                    viewsGroupedByCountry
                })
            )
        })
    }

    private async getTodayViews(): Promise<number> {
        const today = new Date()
        today.setHours(0)

        return await this.logModel.countDocuments({
            timestamp: {
                $gte: today
            }
        })
    }

    private async getThisMonthViews(): Promise<number> {
        const thisMonth = new Date()
        thisMonth.setDate(1)
        thisMonth.setHours(0)

        return await this.logModel.countDocuments({
            timestamp: {
                $gte: thisMonth
            }
        })
    }

    private async getTotalViews(): Promise<number> {
        return await this.logModel.countDocuments()
    }

    private async getViewsGroupedByCountry() {
        const models = await this.logModel.aggregate([
            {
                $group: {
                    _id: "$country",
                    totalViews: { $sum: 1 }
                }
            },
            {
                $sort: {
                    _id: 1
                }
            }
        ])

        return models.map((item) => ({
            ...item,
            emoji: countryEmoji.flag(item._id)
        }))
    }

    private log(...what: any) {
        if (this.opt.debug) {
            if (what) {
                console.log(Minimalytics.TAG, ...what)
            } else {
                console.log(Minimalytics.TAG, "undefined")
            }
        }
    }
}

export default Minimalytics

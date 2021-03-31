# Minimalytics

A minimal, on-premise alternative to Google Analytics

## What the library logs

-   Anonymized IP of the client
-   The timestamp of the visit
-   The country of the request

## What you need

-   A MongoDB instance
-   An Express-based Node.js app

## Install

You can get Minimalytics via [npm](https://npmjs.com)

```bash
$ npm install minimalytics
```

## Usage

Simply import Minimalytics and call the `init` method.
You should call this method right after creating the Express app instance:

```ts
Minimalytics.init({
    express,
    mongoose,

    // The credentials to access to the dashboard
    username: "test_user",
    password: "test_pass",

    // The name of the MongoDB collection
    collection: "visits",

    // Optional
    // Consider a new visit valid for an IP
    // only after this amount of time
    // Default: 1 minute
    deltaMs: 60 * 1000,

    // Optional
    // Include only selected request paths
    // Default: all paths are valid
    validPaths: new Array<string | RegExp>("/home", "/support", new RegExp("/sample/")),

    // Optional
    // Enable console logs. Should be disabled in production.
    // Default: false
    debug: false
})
```

## Screenshot

![Minimalytics Screenshot](/screenshot/screenshot.png?raw=true)

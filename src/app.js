require("dotenv").config();
const express = require("express");
const nunjucks = require("nunjucks");

const http = require("http");
const { URL } = require("url");
const app = express();
const server = http.createServer(app);

const WebSocket = require("ws");
const wss = new WebSocket.Server({ clientTracking: false, noServer: true });
const clients = new Map();


const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const clientPromise = new MongoClient(process.env.DB_LOCAL_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  maxPoolSize: 10,
  minPoolSize: 1,
});

nunjucks.configure("views", {
  autoescape: true,
  express: app,
  tags: {
    blockStart: "[%",
    blockEnd: "%]",
    variableStart: "[[",
    variableEnd: "]]",
    commentStart: "[#",
    commentEnd: "#]",
  },
});

const DB = {
  users: [
    { id: 1, username: "admin", password: "admin" },
    { id: 2, username: "user", password: "user" },
  ],
  tokens: {}
}

app.post("/login", express.json(), (req, res) => {
  const { username, password } = req.body;
  const user = DB.users.find((u) => u.username === username);

  if (!user) {
    return res.status(401).send("Unknown user");
  }
  if (user.password !== password) {
    return res.status(401).send("Unknown password");
  }

  const token = Math.random();
  DB.tokens[token] = user.id;
  res.json({ token });
})

wss.on("connection", (ws, req) => {
  const { userId } = req;

  clients.set(userId, ws);
  ws.on("close", () => {
    clients.delete(userId);
  })

  ws.on("message", message => {
    let data;
    try {
      data = JSON.parse(message)
    } catch (err) {
      console.log(err);
      return;
    }

    if (data.type === "active_timers") {
      const user = DB.users.find((u) => u.id === userId);
      const fullActiveTimers = JSON.stringify({
        type: "active_timers",
        timers: data.message,
        name: user.username
      })
      for (ws of clients.values()) {
        ws.send(fullActiveTimers)
      }
    } else if (data.type === "all_timers") {
      const user = DB.users.find((u) => u.id === userId);
      const fullAllTimers = JSON.stringify({
        type: "all_timers",
        timers: data.message,
        name: user.username
      })
      for (ws of clients.values()) {
        ws.send( fullAllTimers)
      }
    }

  })
})

server.on("upgrade", (req, socket, head) => {
  const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
  const token = searchParams && searchParams.get("token");
  const userId = token && DB.tokens[token];

  req.userId = userId;
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

app.set("view engine", "njk");

app.use(express.json());
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.render("index");
});

app.use(async (req, res, next) => {
  try {
    const client = await clientPromise;
    req.db = client.db("timers");
    next();
  } catch (err) {
    next(err);
  }
});

app.get("/api/timers", (req, res) => {
  req.db
  .collection("timers")
  .find()
  .toArray()
  .then((timers) =>
    timers.map((timer) => {
      const timerObj = {
        ...timer,
        start: +timer.start,
        end: timer.end ? +timer.end : null,
      };

      if (timer.end) {
        timerObj.duration = +timer.end - +timer.start;
      } else {
        timerObj.progress = Date.now() - +timer.start;
      }

      return timerObj;
    })
  )
  .then((timers) => res.json(timers));
});

app.post("/api/timers", (req, res) => {
  const description = req.body.description;
  req.db
    .collection("timers")
    .insertOne({ description, isActive: true, id: new ObjectId().toString(), start: Date.now() })
    .then(() => res.status(200).send('OK'))
    .catch((err) => {
      res.status(404).json({ error: err.message });
    });
});

app.post("/api/timers/:id/stop", (req, res) => {
  const id = req.params.id;

  req.db
    .collection("timers")
    .updateOne({ id }, { $set: { isActive: false, end: Date.now() } })
    .then(() => {
      res.res.status(200).send('OK');
    })
    .catch((err) => {
      res.status(404).json({ error: err.message });
    });
});

const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log(`  Listening on http://localhost:${port}`);
});


module.exports = app;

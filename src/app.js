require("dotenv").config();
const express = require("express");
const nunjucks = require("nunjucks");
const pg = require("knex")({
  client: "pg",
  connection: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  pool: { min: 0, max: 7 },
});

const app = express();

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

app.set("view engine", "njk");

app.use(express.json());
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.render("index");
});


app.get("/api/timers", (req, res) => {
  if (req.query.isActive === "true") {
    pg("timers")
      .whereNull("end")
      .then((timers) =>
        timers.map((timer) => ({
          ...timer,
          start: +timer.start,
          progress: Date.now() - +timer.start,
        }))
      )
      .then((timers) => res.json(timers));
    return;
  }

  pg("timers")
    .whereNotNull("end")
    .then((timers) =>
      timers.map((timer) => ({
        ...timer,
        start: +timer.start,
        end: +timer.end,
        duration: +timer.end - +timer.start,
      }))
    )
    .then((timers) => res.json(timers));
});

app.post("/api/timers", (req, res) => {
  const description = req.body.description;
  const id = Math.random();
  pg("timers")
    .insert({ description, isActive: true, id, start: Date.now() })
    .returning("id")
    .catch((err) => {
      res.status(404).json({ error: err.message });
    });
});

app.post("/api/timers/:id/stop", (req, res) => {
  const id = req.params.id;
  pg("timers")
    .where("id", id)
    .update({ isActive: false, end: Date.now() })
    .then(() => {
      res.sendStatus(200);
    })
    .catch((err) => {
      res.status(404).json({ error: err.message });
    });
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`  Listening on http://localhost:${port}`);
});


module.exports = app;

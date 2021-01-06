const express = require("express");
const getUSStates = require("./getUSStates");
const app = express();

app.use(express.static("public"));

app.get("/api/states", async (req, res) => {
  const states = await getUSStates();
  res.json(states);
});

const port = process.env.PORT || 4242;
app.listen(port, () => {
  console.log("listien");
});

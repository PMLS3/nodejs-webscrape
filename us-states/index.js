const axios = require("axios");
const cheerio = require("cheerio");

const page_url =
  "https://en.wikipedia.org/wiki/List_of_states_and_territories_of_the_United_States";

async function getUSStates() {
  const { data } = await axios.get(page_url);
  const $ = cheerio.load(data);
  const table = $(
    'caption:contains("States of the United States of America")'
  ).parent();
  //   console.log(tables);
  const states = [];
  const rows = table.find("tbody tr").slice(2);
  rows.each((i, element) => {
    const $row = $(element);
    const state = {};

    state.name = $row.find("th a").first().text().trim();

    const labels = [
      "code",
      "capital",
      "ratification",
      "population",
      "total_area_miles",
      "total_area_km",
      "land_area_miles",
      "land_area_km",
      "water_area_miles",
      "water_area_km",
      "number_of_reps",
    ];
    const columns = $row.find("td");

    $row.find("td").each((i, el) => {
      const $col = $(el);

      let hasExtraColumns = false;
      if (i === 1 && $col.attr("colspan") === "2") {
        i += 1;
      }
      const label = labels[i];
      state[label] = $col.text().trim();
    });
    console.log("leng", columns.length);
    states.push(state);

    console.log(states);
  });
}

getUSStates();

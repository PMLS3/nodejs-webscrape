const statesElement = document.getElementById("states");
const infoElement = document.getElementById("info");
async function getUSStates() {
  const respones = await fetch("/api/states");
  const states = await respones.json();

  setUSStates(states);
}

function setUSStates(states) {
  states.forEach((state) => {
    const optionElement = document.createElement("option");
    optionElement.setAttribute("value", state.name);
    optionElement.textContent = state.name;
    statesElement.appendChild(optionElement);

    optionElement.addEventListener("click", () => {
      console.log("state", state.name);
      infoElement.innerHTML = `<pre>${JSON.stringify(state, null, 2)}</pre>`;
    });
  });
}

getUSStates();

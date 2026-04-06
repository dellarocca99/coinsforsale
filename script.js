const PHONE = "5492235831244";

fetch("items.json")
  .then(res => res.json())
  .then(items => {
    window.items = items;
    render(items);
  });

function render(items) {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  items.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "card";

    const message = encodeURIComponent(
      `Hola! Me interesa: ${item.title} (${item.year})`
    );

    const mainImage = item.images[0];

    card.innerHTML = `
      <img id="main-${index}" class="main-img" src="${mainImage}" />

      <div class="thumbs">
        ${item.images.map((img, i) => `
          <img src="${img}" onclick="changeImage(${index}, '${img}')" />
        `).join("")}
      </div>

      <h3>${item.title}</h3>
      <p>${item.country} - ${item.year}</p>
      <p>Estado: ${item.condition}</p>
      <p class="price">${item.price}</p>

      <button onclick="buy('${message}')">
        Consultar por WhatsApp
      </button>
    `;

    grid.appendChild(card);
  });
}

function changeImage(index, src) {
  document.getElementById(`main-${index}`).src = src;
}

function buy(message) {
  window.open(`https://wa.me/${PHONE}?text=${message}`, "_blank");
}

// Buscador
document.getElementById("search").addEventListener("input", e => {
  const value = e.target.value.toLowerCase();

  const filtered = window.items.filter(item =>
    item.title.toLowerCase().includes(value) ||
    item.country.toLowerCase().includes(value)
  );

  render(filtered);
});
const express = require('express');
const moment = require("moment");
const app = express();
const orders = [];

let nextOrderId = 1000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', function (req, res) {
  res.send('Welcome to Pizzaz!');
});

app.get('/order/:id', (req, res) => {
  console.log('/order', req.params.id);
  let order = orders.find(o => o.id == req.params.id);
  if (order) {
      order.status = updateStatus(order);
      res.json(order);
  } else {
      res.status(404).end();
  }
});

app.get('/order', (req, res) => {
  console.log('/order', req.query.phone);
  let filtered = orders
      .filter(o => o.phone === req.query.phone)
      .map(o => {
          o.status = updateStatus(o);
          return o;
      });
  res.json(filtered);
});

app.post('/order', (req, res) => {
  console.log('POST /order');
  let order = req.body;
  console.log(order);
  order.id = nextOrderId;
  order.orderDate = new Date();
  order.status = updateStatus(order);
  calculatePrices(order);
  orders.push(order);

  console.log(order);
  nextOrderId = nextOrderId + 1;
  res.status(201).json(order);
});

app.listen(3000, function () {
  console.log('Example app listening on port 3000!');
});

function updateStatus(order) {
  if (order.status === 'delivered')
      return 'delivered';

  let ordered = moment(order.orderDate);
  let now = moment(new Date());
  let duration = moment.duration(now.diff(ordered)).asMinutes();
  
  if (duration < 5) return 'queued';
  if (duration < 10) return 'being prepared';
  if (duration < 15) return 'in the oven';
  if (duration < 20) return 'out for delivery';

  return 'delivered';
}

function calculatePrices(order) {
  order.pizzas.forEach(pizza => {
    pizza.price = pricePizza(pizza)
  });
  order.total = order.pizzas.reduce((subtotal, pizza) => subtotal + pizza.price, 0);
}

function pricePizza(pizza) {
  return 8 + priceSize(pizza) + priceCrust(pizza) + priceToppings(pizza);
}

function priceSize(pizza) {
  return pizza.size == 'small' ? 0 :
        pizza.size == 'medium' ? 1 :
        pizza.size == 'large' ? 2 : 3;
}

function priceCrust(pizza) {
  return pizza.crust == 'thick' ? 1 : pizza.crust == 'gluten free' ? 3 : 0;
}

function priceToppings(pizza) {
  return pizza.topping.length * .5;
}
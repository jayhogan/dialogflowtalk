'use strict';
 
const functions = require('firebase-functions');
const { WebhookClient, Suggestion, Payload } = require('dialogflow-fulfillment');
const got = require('got');
const currencyFormatter = require('currency-formatter');

const baseUrl = 'https://weak-falcon-45.localtunnel.me';
 
process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements
 
exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
  


  function orderAddPizza(agent) {
    // Fulfillment slot filling allows more control of the response prompts
    if (!agent.parameters.size) {
      // Prompt for missing pizza size parameter
      agent.add('What size would you like?');

      // Provide suggestions/quick replies for platforms that support them
      ['small','medium','large','extra large'].forEach(size => agent.add(new Suggestion(size)));

    } else if (!agent.parameters.crust) {
      agent.add('What kind of crust?');
      ['regular','thin','thick','gluten free'].forEach(crust => agent.add(new Suggestion(crust)));

    } else if (!agent.parameters.topping || agent.parameters.topping.length === 0) {
      agent.add('And for the toppings?');

    } else {
      // All parameters present. Create a pizza object
      const pizza = {
        size: agent.parameters.size,
        crust: agent.parameters.crust,
        topping: agent.parameters.topping
      };

      // Add it to the context
      const orderCtx = agent.getContext('order');
      orderCtx.parameters.pizzas = orderCtx.parameters.pizzas || [];
      orderCtx.parameters.pizzas.push(pizza);

      // Add context to the response
      agent.setContext(orderCtx);

      // We will use the static responses. Any response added here would override the static response
    }
  }
  


  function orderDone(agent) {
    // Create order object from parameters on order context
    const orderCtx = agent.getContext('order');
    let order = {
      pizzas: orderCtx.parameters.pizzas,
      phone: orderCtx.parameters.phone,
      address: orderCtx.parameters.address
    };

    // Create order in backend. Be sure to return promises!!
    return got('/order', { baseUrl, body: order, json: true }).then(resp => {
      order = resp.body;
      console.log(order); // Debugging logs can be found in Firebase console

      let orderTotal = currencyFormatter.format(order.total, { locale: 'en-US' });

      agent.add(`Order ${ order.id } will run you ${ orderTotal }. Your food will be delivered to ${ order.address['street-address'] } within 20 minutes. We'll call ${ order.phone } if we have questions. See you soon!`);
      
      // Let's send a fancy Slack response
      agent.add(new Payload('SLACK', orderDoneSlackResponse(order)));

      // Clear order context and set currentorder context for order tracking
      agent.clearContext('order');
      agent.setContext({ name: 'currentorder', lifespan: 2, parameters: { orderId: order.id }});
    }).catch(e => {
      console.log(e);
      agent.add('💣 Something went wrong! Call our store at (804) 555-9999 to place an order.');
    });
  }
  


  function orderCancel(agent) {
    agent.clearContext('order');
  }
  


  function orderTrack(agent) {
    // Determine orderNumber from parameters or currentorder context
    let orderId = agent.parameters['order-id'];
    if (!orderId) {
      // Lookup currentorder context, if it exists
      let currentOrderCtx = agent.getContext('currentorder');

      if (currentOrderCtx) {
        // Cool. Grab the order number. Now we don't have to prompt the user
        orderId = currentOrderCtx.parameters.orderId;
      } else {
        // Prompt for order number if necessary
        agent.add('What is your order number?');
        return;
      }
    }

    // Get order information from the backend
    return got(`/order/${orderId}`, { baseUrl, json: true, throwHttpErrors: false }).then(resp => {
      if (resp.statusCode === 200 && resp.body) {
        // Respond with order status
        agent.add(`Your order is ${resp.body.status}.`);

        // Set currentorder context to avoid order-id prompts
        agent.setContext({ name: 'currentorder', lifespan: 2, parameters: { orderId: resp.body.id }});

      } else if (resp.statusCode === 404) {
        // User typed the wrong order #?
        agent.add(`Hmm, order number ${orderId} doesn't seem to exist. 🤷`);

      } else {
        // Some other response...likely an error
        agent.add('💣 Something went wrong! Call our store at (804) 555-9999 to track your order.');  

      }
    }).catch(e => {
      console.log(e);
      agent.add('💣 Something went wrong! Call our store at (804) 555-9999 to track your order.');
    });
  }
  


  let intentMap = new Map();
  intentMap.set('order-add-pizza', orderAddPizza);
  intentMap.set('order-done', orderDone);
  intentMap.set('order-cancel', orderCancel);
  intentMap.set('order-track', orderTrack);
  agent.handleRequest(intentMap);
});

function orderDoneSlackResponse(order) {
  let blocks = [];
  let address = order.address['street-address']; // Just the street address, for simplicity
  
  // Header
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Order Confirmation: ${order.id}*`}});

  // Pizzas
  order.pizzas.forEach(pizza => {
    let price = currencyFormatter.format(pizza.price, { locale: 'en-US' });
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Size:* ${pizza.size}` },
        { type: 'mrkdwn', text: `*Crust:* ${pizza.crust}` },
        { type: 'mrkdwn', text: `*Toppings:* ${pizza.topping.join(', ')}` },
        { type: 'mrkdwn', text: `*Price:* ${price}` }
      ]
    });
  });

  // Summary
  let orderTotal = currencyFormatter.format(order.total, { locale: 'en-US' });
  blocks.push({ type: 'divider' });
  blocks.push({ type: 'section',
		text: {
			type: 'mrkdwn',
			text: `*Address:* ${address}\n\n*Phone:* ${order.phone}\n\n*Total:* ${orderTotal}`
    }
  });
  
  // Disclaimer
  blocks.push({ type: 'divider' });
  blocks.push({
		type: 'context',
		elements: [
			{
				type: 'mrkdwn',
				text: 'Payment due in full upon delivery. Drivers accept cash and card. Thank you for you order.'
			}
		]
  });
  
  return {  text: '', attachments: [{ blocks }] };
}
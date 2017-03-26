var Alexa = require('alexa-sdk'),
    https = require('https'),
    _ = require('lodash'),
    moment = require('moment');

var appId = '';

var URL = 'https://www.gov.uk/bank-holidays.json';
var COUNTRIES = {
  'england': 'england-and-wales',
  'wales': 'england-and-wales',
  'scotland': 'scotland',
  'northern ireland': 'northern-ireland'
};

// Capitalization helper
String.prototype.capitalize = function() {
  return this.replace(/\b\w/g, function(letter) {
    return letter.toUpperCase();
  });
};

// Gets JSON response and runs success/error callbacks
function getData(url, callback, errorCallback) {
  https.get(url, function(res) {
    var body = '';
    res.on('data', function(chunk) {
      body += chunk;
    });
    res.on('end', function() {
      var jsonResponse = JSON.parse(body);
      callback(jsonResponse);
    });
  }).on('error', function() {
    errorCallback();
  });
}

// Returns true if country is not present in list
function invalidCountry(country) {
  return Object.keys(COUNTRIES).indexOf(country) === -1;
}

// Handles a request for the next public holiday
function getNextPublicHoliday(self, country) {
  switch (country) {
    case 'cancel':
    case 'stop':
      self.emit('AMAZON.NoIntent');
      return;
      break;

    case 'help':
      self.emit('AMAZON.HelpIntent');
      return;
      break;

    default:
      if ( country && invalidCountry(country) ) {
        var countryNames = _.map(Object.keys(COUNTRIES), function(country) {
          return country.toUpperCase();
        });
        var permittedCountries = countryNames.slice(0, countryNames.length - 1).join(',') + ' or ' + countryNames[countryNames.length - 1];
        var prompt = 'You said ' + country + '. I can give you the next public holiday for ' + permittedCountries + '. Which country would you like to hear the next public holiday for?';
        var reprompt = 'Sorry, I don\'t know public holidays for ' + country + ' try asking for the next public holiday in ' + permittedCountries + '.';
        self.emit(':ask', prompt, reprompt);
        return;
      }
      var url = country ? URL.replace('.json', '/' + COUNTRIES[country] + '.json') : URL;
      getData(url, function(data) {
        var holidays = [];
        if ( !country ) {
          // Loop over all countries and append events
          _.forIn(COUNTRIES, function(value) {
            holidays = _.concat(holidays, _.get(data, value + '.events'));
          });
        } else {
          // Append all events for selected country
          holidays = _.concat(holidays, _.get(data, 'events'));
        }

        // Find the next public holiday
        var today = moment();
        var next = _.find(_.sortBy(holidays, ['date']), function(holiday) {
          return moment(holiday.date).isAfter(today);
        });

        if ( next !== undefined ) {
          var date = moment(next.date),
              year = date.year() === today.year() ? '????' : date.year(),
              speechDate = '<say-as interpret-as="date">' + year + date.format('MMDD') + '</say-as>',
              displayDate = date.format('dddd, Do MMMM YYYY');
          if ( country ) {
            var speechOutput = 'The next public holiday in ' + country + ' is ' + next.title + ' on ' + speechDate;
            var cardContent = 'The next public holiday in ' + country.capitalize() + ' is ' + next.title + ' on ' + displayDate;
          } else {
            var speechOutput = 'The next public holiday in the u.k. is ' + next.title + ' on ' + speechDate;
            var cardContent = 'The next public holiday in the UK is ' + next.title + ' on ' + displayDate;
          }
          self.emit(':tellWithCard', speechOutput, next.title, cardContent);
        } else {
          self.emit('Failed');
        }
      }, function() {
        self.emit('Failed');
      });
    break;
  }
}

var handlers = {
  'LaunchIntent': function() {
    this.emit('NextPublicHolidayIntent');
  },
  'NextPublicHolidayIntent': function() {
    var country = false;
    if (typeof this.event.request.intent.slots.country !== 'undefined' && this.event.request.intent.slots.country.value) {
      country = (this.event.request.intent.slots.country.value).toLowerCase();
    }
    getNextPublicHoliday(this, country);
  },
  'Failed': function() {
    this.emit(':tell', 'I\'m sorry, I can\'t access that information right now. Please try again later.');
  },
  'Unhandled': function() {
    this.emit('AMAZON.HelpIntent');
  },
  'AMAZON.HelpIntent': function() {
    var message = 'To get public holidays say the name of your country, e.g. Scotland.';
    this.emit(':ask', message, message);
  },
  'AMAZON.StopIntent': function() {
    this.emit('AMAZON.NoIntent');
  },
  'AMAZON.CancelIntent': function() {
    this.emit('AMAZON.NoIntent');
  },
  'AMAZON.NoIntent': function() {
    this.emit(':tell', 'Thank you for using UK Public Holidays, goodbye.');
  }
};

exports.handler = function(event, context) {
  var alexa = Alexa.handler(event, context);
  alexa.appId = appId;
  alexa.registerHandlers(handlers);
  alexa.execute();
};
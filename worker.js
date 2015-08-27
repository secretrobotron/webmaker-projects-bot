var pg = require('pg');
var irc = require('irc');
var request = require('request');

var pgConnectionString = process.env.PG_CONN_STRING;
var sleepInterval = process.env.SLEEP_DURATION;                            // in milliseconds

var _ircClient;

function getIRCClient (callback) {
  if (!_ircClient || !_ircClient.conn.connected) {
    console.log('Connecting to irc @ ' + process.env.IRC_SERVER + ' as ' + process.env.IRC_NICK + '...');
    _ircClient = new irc.Client(process.env.IRC_SERVER, process.env.IRC_NICK, {
      channels: [process.env.IRC_CHANNEL],
      secure: true,
      port: 6697
    });

    _ircClient.addListener('registered', function (message) {
      callback(_ircClient);
    });

    _ircClient.addListener('error', function(message) {
      console.error('IRC client error: ', message);
      _ircClient.disconnect();
      _ircClient = null;
    });
  }
  else {
    callback(_ircClient);
  }
}


function getOneProject () {
  console.log('Waking up!');

  var currentDate = new Date();

  if (currentDate.getDay() === 6) {
    var sleepHours = 24 + (24 - currentDate.getHours()); // a day and whatever else is left until Monday
    console.log('It\'s Saturday. Come on... Going back to bed for ' + sleepHours + ' hours :). zzzzzzz');

    setTimeout(getOneProject, sleepHours * 3600000);
    return;
  }
  else if (currentDate.getDay() === 7) {
    var sleepHours = 24 - currentDate.getHours(); // whatever else is left until Monday
    console.log('It\'s Sunday. Still BBQ\'n for ' + sleepHours + ' more hours :). *sizzle*');

    setTimeout(getOneProject, sleepHours * 3600000);
    return;
  }
  else if (currentDate.getHours() > parseInt(process.env.END_HOUR)) {
    var sleepHours = 24 - currentDate.getHours() + parseInt(process.env.START_HOUR);
    console.log('Past my bed time! Good night. See you in ' + sleepHours + ' hours :).');

    setTimeout(getOneProject, sleepHours * 3600000);         // go to sleep until morning :)
    return;
  }
  else if (currentDate.getHours() < parseInt(process.env.START_HOUR)) {
    var sleepHours = parseInt(process.env.START_HOUR) - currentDate.getHours();
    console.log('Yaaawn... Still have some time to sleep. See you in ' + sleepHours + ' hours :).');

    setTimeout(getOneProject, sleepHours * 3600000);         // go to sleep again :)
    return;
  }

  console.log('Connecting to pg @ ' + process.env.PG_CONN_STRING + '...');
  pg.connect(pgConnectionString, function(err, client, done) {
    if (err) {
      return console.error('error fetching client from pool', err);
    }

    client.query('SELECT * FROM projects WHERE date_used IS NULL ORDER BY date_added ASC LIMIT 1;', function (err, result) {
      if (err) {
        console.error('Couldn\'t query database for projects.');
        console.error(err);
        done();
        return;
      }

      var project = result.rows[0];

      if (project) {
        getIRCClient(function (ircClient) {
          console.log('Found project ' + project.id + '! Updating db entry...');
          client.query('UPDATE projects SET date_used = current_timestamp WHERE id = ' + project.id);

          console.log('Getting project data from Webmaker...');
          request(process.env.WEBMAKER_API_PREFIX + '/projects/' + project.project_id, function (error, response, body) {

            if (error) {
              console.error('Couldn\'t get project information from Webmaker API: ' + project.id);
              console.error(error);
              done();
              return;
            }

            var projectData = JSON.parse(body);

            if (projectData.status !== 'success') {
              console.error('Webmaker API server responded unhappily.');
              console.error(projectData);
              done();
              return;
            }

            console.log('Talking about it on IRC...');
            var projectURL = process.env.WEBMAKER_PLAYER_PREFIX + '?user=' + projectData.project.user_id + '&project=' + project.project_id;
            ircClient.say(process.env.IRC_CHANNEL, project.comment + ': ' + projectURL);

            console.log('Done :). Sleeping...');
            done();
            setTimeout(getOneProject, sleepInterval);
          });
        });
      }
      else {
        console.log('No new projects found. Sleeping...');
        done();
        setTimeout(getOneProject, sleepInterval);
      }
    });

  });
}

getOneProject();
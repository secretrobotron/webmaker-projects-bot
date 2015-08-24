var pg = require('pg');
var irc = require('irc');
var request = require('request');

var pgConnectionString = process.env.PG_CONN_STRING;
var sleepInterval = 1800000;                            // 30 minutes

console.log('Connecting to pg @ ' + process.env.PG_CONN_STRING + '...');
pg.connect(pgConnectionString, function(err, client, done) {

  console.log('Connecting to irc @ ' + process.env.IRC_SERVER + ' as ' + process.env.IRC_NICK + '...');
  var ircClient = new irc.Client(process.env.IRC_SERVER, process.env.IRC_NICK, {
    channels: [process.env.IRC_CHANNEL]
  });

  ircClient.addListener('error', function(message) {
    console.error('IRC client error: ', message);
  });

  function getOneProject () {
    console.log('Waking up!');

    client.query('SELECT * FROM projects WHERE date_used IS NULL ORDER BY date_added ASC LIMIT 1;', function (err, result) {
      if (err) {
        console.error('Couldn\'t query database for projects.');
        console.error(err);
        done();
        return;
      }

      var project = result.rows[0];

      if (project) {
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
          // ircClient.say(process.env.IRC_CHANNEL, project.comment + ': ' + projectURL);

          console.log('Done :). Sleeping...');
          done();
          setTimeout(getOneProject, sleepInterval);
        });
      }
      else {
        console.log('No new projects found. Sleeping...');
        done();
        setTimeout(getOneProject, sleepInterval);
      }
    });
  }

  if (err) {
    return console.error('error fetching client from pool', err);
  }

  getOneProject();
});


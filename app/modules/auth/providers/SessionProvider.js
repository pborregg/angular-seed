define( [ 'angular', '../module' ], function( ng ) {
  'use strict';

  /**
   * @ngdoc service
   * @name ngSeed.services:CSSession
   * @description
   * A set of functions to easily signIn/signOut, register new users, and
   * retrieving the user session from the server.
   *
   * ### Example
   * ```js
   * myApp.controller('Test', ['$scope', 'CSSession', function ($scope, CSSession) {
   *   $scope.$watch(CSSession.getCurrentUser, function() {
   *     // do something as soon as the user changes
   *     // and by this I mean logs in or out
   *   });
   *
   *   if (CSSession.isLoggedIn()) {
   *     // do something if the user is logged in
   *     // thou this is not necessary on non-public pages
   *     // on public ones you might want to use it
   *     // to do some other logic
   *   }
   * }]);
   * ```
   */

  /**
   * @ngdoc service
   * @name ngSeed.providers:SessionProvider
   * @description
   * Dead-easy auth checking.
   *
   * Please note that custom signIn requiring logic, on-location-change auth
   * checking, and default signIn success behaviour can be configured
   * using the authProvider on a config block.
   *
   * ### Configuring SessionProvider:
   * This is the default value, feel free to change it to something else if your app requires it:
   *
   * ```js
   * SessionProvider.setSessionService('sessionService');
   *
   * SessionProvider.setHandler('handleSignInStart', function (redirect) {
   *   $('#mysignInModal').open();
   * });
   *
   * SessionProvider.setHandler('handleSignInSuccess', function () {
   *   $('#mysignInModal').close();
   * });
   * ```
   *
   * ### Securing Routes:
   * Add a `public: false` property or a `public: true` property to your routes. In fact,
   * any falsy value will end up requiring signIn. For instance:
   *
   * ```js
   * $routeProvider
   *  .when('/', {
   *    templateUrl: view('home'),
   *    controller: 'HomeCtrl',
   *    public: true
   *  })
   *  .when('/users', {
   *    templateUrl: view('users'),
   *    controller: 'UserCtrl',
   *  })
   *  .when('/error', {
   *    templateUrl: partial('error'),
   *    public: true
   *  })
   *  .otherwise({
   *    redirectTo: '/'
   *  });
   * ```
   *
   * This will give you a public home and error routes. If you try to access `/users`, you will
   * immediately be prompted for authentication.
   */

  ng
  .module( 'auth.providers' )
  .provider( 'Session', [
    function() {
      /**
       * @name currentUser
       * @type {Object}
       * @propertyOf ngSeed.providers:SessionProvider
       * @description
       * the logged in user or undefined
       */
      var currentUser = null;

      /**
       * @name sessionService
       * @type {Object}
       * @propertyOf ngSeed.providers:SessionProvider
       * @description
       * The user service.
       */
      var sessionService = null;

      /**
       * @name sessionServiceName
       * @type {String}
       * @propertyOf ngSeed.providers:SessionProvider
       * @description
       * The name of the service to $inject.
       */
      var sessionServiceName = 'SessionService';

      /**
       * @name sessionService
       * @type {Object}
       * @propertyOf ngSeed.providers:SessionProvider
       * @description
       * The user service.
       */
      var accountService = null;

      /**
       * @name sessionServiceName
       * @type {String}
       * @propertyOf ngSeed.providers:SessionProvider
       * @description
       * The name of the service to $inject.
       */
      var accountServiceName = 'AccountService';

      /**
       * @name handlers
       * @type {Object}
       * @propertyOf ngSeed.providers:SessionProvider
       * @description
       * The handlers object.
       */
      var handlers = {
        signUpSuccess:  null,
        signUpFailure:  null,
        signInStart:    null,
        signInSuccess:  null,
        signOutSuccess: null,
        locationChange: null
      };

      function switchRouteMatcher(on, when, whenProperties) {
        // TODO(i): this code is convoluted and inefficient, we should construct the route matching
        //   regex only once and then reuse it

        // Escape regexp special characters.
        when = '^' + when.replace(/[-\/\\^$:*+?.()|[\]{}]/g, '\\$&') + '$';

        var regex = '',
            params = [],
            dst = {};

        var re = /\\([:*])(\w+)/g,
            paramMatch,
            lastMatchedIndex = 0;

        while ((paramMatch = re.exec(when)) !== null) {
          // Find each :param in `when` and replace it with a capturing group.
          // Append all other sections of when unchanged.
          regex += when.slice(lastMatchedIndex, paramMatch.index);
          switch(paramMatch[1]) {
          case ':':
            regex += '([^\\/]*)';
            break;
          case '*':
            regex += '(.*)';
            break;
          }
          params.push(paramMatch[2]);
          lastMatchedIndex = re.lastIndex;
        }
        // Append trailing path part.
        regex += when.substr(lastMatchedIndex);

        var match = on.match(new RegExp(regex, whenProperties.caseInsensitiveMatch ? 'i' : ''));
        if (match) {
          ng.forEach(params, function(name, index) {
            dst[name] = match[index + 1];
          });
        }
        return match ? dst : null;
      }

      /**
       * @description
       * The actual service.
       */
      return {

        $get: [ '$rootScope', '$location', '$route', '$injector', '$log',
        function( $rootScope, $location, $route, $injector, $log ) {
          var messenger = $injector.has( 'Messenger' ) ? $injector.get( 'Messenger' ) : $log;

          if ( !sessionService && sessionServiceName ) {
            sessionService = $injector.get( sessionServiceName );
          }

          if ( !sessionService ) {
            throw new Error( 'SessionProvider: please configure a sessionService' );
          }

          if ( !accountService && accountServiceName ) {
            accountService = $injector.get( accountServiceName );
          }

          if ( !accountService ) {
            throw new Error( 'SessionProvider: please configure a accountService' );
          }

          if ( !handlers.signInStart ) {
            $log.log( 'SessionProvider: using default signInStart method' );
          }

          if ( !handlers.signInSuccess ) {
            $log.log( 'SessionProvider: using default signInSuccess method' );
          }

          if ( !handlers.locationChange ) {
            $log.log( 'SessionProvider: using default locationChange method' );
          }

          /**
           * @ngdoc function
           * @name handlers.signInStart
           * @propertyOf ngSeed.providers:SessionProvider
           * @description
           * Default signIn starting logic.
           */
          handlers.signInStart = handlers.signInStart || function( redirect ) {
            $log.log( 'SessionProvider: redirecting to /signIn' );

            $location.path( '/signIn' );
            $location.search({
              redirect: encodeURIComponent( redirect )
            });
            return;
          };

          /**
           * @ngdoc function
           * @name handlers.signInSuccess
           * @propertyOf ngSeed.providers:SessionProvider
           * @description
           * This method redirects the user to the redirect search term if
           * it exists.
           */
          handlers.signInSuccess = handlers.signInSuccess || function() {
            if ( $location.search().redirect ) {
              $log.log( 'SessionProvider: redirecting to', $location.search().redirect );

              $location.path( $location.search().redirect );
              $location.search( {} );
            } else {
              $location.path( '/' );
            }
          };

          /*
           * @ngdoc function
           * @name handlers.signInSuccess
           * @propertyOf ngSeed.providers:SessionProvider
           * @description
           * This method redirects the user to the redirect search term if
           * it exists.
           */
          handlers.signOutSuccess = handlers.signOutSuccess || function() {
            messenger.success( 'User has successfully signed out.' );
            $location.path( '/' );
          };

          /**
           * @name signUpSuccess
           * @description
           * This method is a success callback for signUp function
           */
          handlers.signUpSuccess = handlers.signUpSuccess || function( user ) {
            if ( !user || !user.id ) {
              $rootScope.$broadcast( 'SessionProvider:signUpFailure', user );
            } else {
              $rootScope.$broadcast( 'SessionProvider:signUpSuccess', user );
            }
          };

          /**
           * @name signUpFailure
           * @description
           * This method is an eror callback for signUp function
           */
          handlers.signUpFailure = handlers.signUpFailure || function( error ) {
            currentUser = null;
            $rootScope.$broadcast('SessionProvider:signUpFailure', error );
          };

          /**
           * @name userReload
           * @description
           * Re-fetches the user object from the DB
           */
          handlers.userReload = handlers.userReload || function () {
            accountService.getCurrentUser(true).then(function (user) {
              currentUser = user;
            });
          };

          /**
           * @ngdoc function
           * @name handlers.locationChange
           * @propertyOf ngSeed.providers:SessionProvider
           * @description
           * This method takes a user navigating, does a quick auth check
           * and if everything is alright proceeds.
           */
          handlers.locationChange = handlers.locationChange || function( event, next ) {
            next = '/' + next.split( '/' ).splice( 3 ).join( '/' ).split( '?' )[ 0 ];
            if( next.length > 1 && next.substr(-1) === '/' ){
              next = next.substr(0, next.length - 1);
            }

            if ( currentUser === null || !currentUser.id ){
              var route;
              ng.forEach($route.routes, function(when, pathTemplate){
                if(switchRouteMatcher(next, pathTemplate, when)){
                  route = route || when;
                }
              });

              $log.log( 'SessionProvider: Guest access to', next );
              $log.log( 'SessionProvider:', next, 'is', route.public ? 'public' : 'private' );

              if ( route && !route.public ) {
                $rootScope.$broadcast( 'SessionProvider:signInStart' );
                handlers.signInStart( next.substr( 1 ) );
              }
            } else {
              $log.log( 'SessionProvider: proceeding to load', next );
            }
          };

          /**
           * @description
           * $rootScope hookups
           */
          $rootScope.$on( '$locationChangeStart', function( event, next, current ) {
            if ( !$route.current ) {
              $log.log( 'SessionProvider: Welcome newcomer!' );
              $log.log( 'SessionProvider: Checking your session...' );

              sessionService
                .session().$promise
                .then( function( user ) {
                  if ( user.id ) {
                    $log.log( 'SessionProvider: we got', user );

                    currentUser = user;
                    if ( ng.isFunction( handlers.locationChange ) ) {
                      handlers.locationChange( event, next, current );
                    }
                  } else {
                    throw user;
                  }
                })
                .catch( function( err ) {
                  $log.log( 'SessionProvider: request failed' + ( err.message ? err.message : err ) );
                  $log.log( 'SessionProvider: proceeding as guest.' );

                  if ( ng.isFunction( handlers.locationChange ) ) {
                    handlers.locationChange( event, next, current );
                  }
                });
            } else {
              if ( ng.isFunction( handlers.locationChange ) ) {
                handlers.locationChange( event, next, current );
              }
            }
          });

          $rootScope.$on( 'SessionProvider:signInSuccess', function() {
            if ( ng.isFunction( handlers.signInSuccess ) ) {
              handlers.signInSuccess();
            }
          });

          $rootScope.$on( 'SessionProvider:signOutSuccess', function() {
            if ( ng.isFunction( handlers.signOutSuccess ) ) {
              handlers.signOutSuccess();
            }
          });

          $rootScope.$on( 'SessionProvider:signInRequired', function() {
            messenger.error( 'User is not authenticated, please sign in to continue.' );
            $location.path( '/signIn' );
          });

          return {
            /**
             * @name getCurrentUser
             * @ngdoc function
             * @methodOf ngSeed.services:CSSession
             * @return {Object} the current user
             */
            getCurrentUser: function() {
              return currentUser;
            },

            /**
             * @name isLoggedIn
             * @ngdoc function
             * @methodOf ngSeed.services:CSSession
             * @return {Boolean} true or false if there is or not a current user
             */
            isLoggedIn: function() {
              return !!currentUser;
              // return (currentUser === null || !currentUser.id) ? false : true;
            },


            /**
             * @name signIn
             * @ngdoc function
             * @methodOf ngSeed.services:CSSession
             * @param  {Object} credentials the credentials to be passed to the signIn service
             * @return {Promise}            the promise your signIn service returns on signIn
             */
            signIn: function( credentials ) {
              return sessionService
                .signIn( credentials ).$promise
                .then( function( user ) {
                  if ( user.id ) {
                    currentUser = user;
                    $rootScope.$broadcast( 'SessionProvider:signInSuccess' );
                  } else {
                    throw user;
                  }
                })
                .catch( function( err ) {
                  $rootScope.$broadcast( 'SessionProvider:signInFailure', {
                    message: ( !!err.message ? err.message : err )
                  });
                });
            },

            /**
             * @name signOut
             * @ngdoc function
             * @methodOf ngSeed.services:CSSession
             * @return {Promise} the promise your signIn service returns on signOut
             */
            signOut: function() {
              $rootScope.$broadcast( 'SessionProvider:signOutSuccess' );
              if ( currentUser && currentUser.id ) {
                return sessionService.signOut().$promise.then( function() {
                  currentUser = null;
                });
              }
            },

            /**
             * @name authenticate
             * @ngdoc function
             * @methodOf ngSeed.services:CSSession
             * @return {Promise} the promise your signIn service returns on signOut
             */
            authenticate: function( user ) {
              if ( !user || !user.id ){
                throw new Error( 'Unable to authenticate with', user );
              }
              currentUser = user;
              $rootScope.$broadcast( 'SessionProvider:signInSuccess' );
              $rootScope.$broadcast( 'SessionProvider:authenticated' );
            },

            /**
             * @name signUp
             * @param  {Object} credentials  the user (and account) credentials
             * @return {Promise}             the promise your account service returns on signUp.
             */
            signUp: function( credentials ) {
              return accountService
                .create( credentials ).$promise
                .then( function( response ){
                  return handlers.signUpSuccess( response, currentUser );
                })
                .catch( function( err ) {
                  return handlers.signUpFailure( err, currentUser );
                });
            },

            /**
             * @name confirmSignUp
             * @param  {string}   token     as received from the confirmation email link
             * @return {Promise} the promise your user service returns on 'signUpRegistration'
             */
            confirmSignUp: function( data ) {
              return accountService
                .confirm( data ).$promise
                .then( function() {
                  $rootScope.$broadcast( 'SessionProvider:signUpConfirmationSuccess' );
                })
                .catch( function( err ) {
                  $rootScope.$broadcast( 'SessionProvider:signUpConfirmationFailure', { err: err } );
                });
            },

            /**
             * @name requestPasswordReset
             * @param  {string} email, as received from the reset password form
             * @return {Promise} the promise your user service returns on 'requestPasswordReset'
             */
            requestPasswordReset: function( email ) {
              return sessionService
                .requestPasswordReset( email ).$promise
                .then( function() {
                  $rootScope.$broadcast( 'SessionProvider:requestPasswordResetSuccess' );
                })
                .catch( function( err ) {
                  $rootScope.$broadcast( 'SessionProvider:requestPasswordResetFailure', !!err.message ? err.message : err );
                });
            },

            /**
             * @name submitPasswordReset
             * @param  {string} email, as received from the reset password form
             * @return {Promise} the promise your user service returns on 'requestPasswordReset'
             */
            submitPasswordReset: function( data ) {
              return sessionService
                .submitPasswordReset( data )
                .then( function() {
                  $rootScope.$broadcast( 'SessionProvider:submitPasswordResetSuccess' );
                })
                .catch( function( err ) {
                  $rootScope.$broadcast( 'SessionProvider:submitPasswordResetFailure', !!err.message ? err.message : err );
                });
            },


          };

        }],

        /**
         * @ngdoc function
         * @methodOf ngSeed.providers:SessionProvider
         * @name setSessionService
         * @param  {String} usr the user service name
         */
        setSessionService: function( serviceName ) {
          if ( !ng.isString( serviceName ) ) {
            throw new Error( 'SessionProvider: setSessionService expects a string to use $injector upon instantiation' );
          }
          sessionServiceName = serviceName;
        },

        /**
         * @ngdoc function
         * @methodOf ngSeed.providers:SessionProvider
         * @name setHandler
         * @param  {String} key  the handler name
         * @param  {Function} foo    the handler function
         * @description
         * Replaces one of the default handlers.
         */
        setHandler: function( key, foo ) {
          if ( key.substr( 0, 6 ) !== 'handle' ) {
            throw new Error( 'SessionProvider: Expecting a handler name that starts with \'handle\'.' );
          }

          if ( !handlers.hasOwnProperty( key ) ) {
            throw new Error( 'SessionProvider: handle name "' + key + '" is not a valid property.' );
          }

          if ( !ng.isFunction( foo ) ) {
            throw new Error( 'SessionProvider: foo is not a function.' );
          }

          handlers[ key ] = foo;
        }

      };

    }
  ]);
});

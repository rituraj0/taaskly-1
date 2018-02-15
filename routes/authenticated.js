'use strict';

const express = require('express');
const logger = require('heroku-logger');
const Op = require('sequelize').Op;

const db = require('../db');
const graph = require('../graph');
const messages = require('../messages');

const router = express.Router();

router.use((req, res, next) => {
  res.locals.navigation = [
    {name: 'Documents', path: '/documents'},
    {name: 'Messages', path: '/messages'},
    {name: 'Admin', path: '/admin'},
  ];
  next();
});

router.route('/logout')
  .get((req, res, next) => {
    req.logout();
    res.redirect('/');
  });

router.route('/documents')
  .get((req, res, next) => db.models.document
    .findAll({
      where: {
        [Op.or]: [{ownerId: req.user.id}, {privacy: 'public'}],
      },
      order: [['updatedAt', 'DESC']]
    })
    .then(documents => res.render('documents', {documents}))
    .catch(next),
  );

router.route('/document/create')
  .get((req, res, next) => res.render('createDocument'))
  .post((req, res, next) => db.models.document
    .create({
      name: req.body.name,
      content: req.body.content,
      privacy: req.body.privacy,
      ownerId: req.user.id,
    })
    .then(() => res.redirect('/documents'))
    .catch(next),
  );

router.route('/document/:id')
  .get((req, res, next) => db.models.document
    .findById(req.params.id, {include: [{model: db.models.user, as: 'owner'}]})
    .then(document => {
      if (!document) {
        return res
          .status(404)
          .render(
            'error',
            {
              header: 'Document does not exist',
              message: 'The document you requested does not seem to exist.',
            },
          );
      }
      if (document.privacy === 'restricted' && req.user.id !== document.owner.id) {
        return res
          .status(403)
          .render(
            'error',
            {
              header: 'Document is private',
              message: 'This document is private.',
            },
          );
      }
      return res.render('document', {document});
    })
    .catch(next),
  );

router.route('/messages')
  .get((req, res, next) => res.render('messages'))
  .post((req, res, next) => {
      messages.postMessage(req.body.target, req.body.message)
      .then(() => res.redirect('/messages'))
      .catch(next);
    },
  );

router.route('/link_account_confirm')
  .get((req, res ,next) => {
    const signedRequest = req.session.signedRequest;
    if (!signedRequest) {
      return res
        .status(400)
        .render('error', {message: 'No saved signed request.'});
    }
    Promise.all([
      db.models.community.findById(signedRequest.community_id),
      db.models.user.findOne({where: {workplaceID: signedRequest.user_id}}),
    ])
    .then(results => {
      const [community, user] = results;
      if (!community) {
        return res
          .status(400)
          .render(
            'error',
            {message: `No community with id ${signedRequest.community_id} found`},
          );
      }
      if (user && user.id !== req.user.id) {
        return res
          .status(400)
          .render(
            'error',
            {message: `This user is already linked to somebody else.`},
          );
      }
      return res.render('linkAccount', {community});
    })
    .catch(next);
  })
  .post((req, res, next) => {
    const signedRequest = req.session.signedRequest;
    Promise.all([
      db.models.community.findById(signedRequest.community_id),
      db.models.user.findOne({where: {workplaceID: signedRequest.user_id}}),
    ]).then(results => {
      const [community, user] = results;
      const redirect = signedRequest.redirect;
      delete req.session.signedRequest;
      return req.user
        .set('workplaceID', signedRequest.user_id)
        .save()
        .then(user => res.render('linkSuccess', {redirect}));
    })
    .catch(next);
  });

module.exports = router;

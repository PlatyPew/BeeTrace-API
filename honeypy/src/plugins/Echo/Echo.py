# HoneyPy Copyright (C) 2013-2017 foospidy
# https://github.com/foospidy/HoneyPy
# See LICENSE for details

from twisted.internet import protocol, reactor, endpoints
from twisted.python import log
import uuid

### START CUSTOM IMPORTS ###

############################

class Echo(protocol.Protocol): ### Set custom protocol class name
	localhost   = None
	remote_host = None
	session     = None

	### START CUSTOM VARIABLES ###############################################################
	
	##########################################################################################
	
	# handle events
	def connectionMade(self):
		self.connect()

		### START CUSTOM CODE ####################################################################
		
		##########################################################################################

	def dataReceived(self, data):
		self.rx(data)

		### START CUSTOM CODE ####################################################################
		self.tx(data)

		##########################################################################################

	### START CUSTOM FUNCTIONS ###################################################################

	##############################################################################################

	def connect(self):
		self.local_host  = self.transport.getHost()
		self.remote_host = self.transport.getPeer()
		self.session     = uuid.uuid1()
		log.msg('%s %s %s %s -> %s %s ' % (self.factory.name, self.remote_host.type, self.remote_host.host, self.remote_host.port, self.local_host.host, self.local_host.port))

	def clientConnectionLost(self):
		self.transport.loseConnection()
	
	def tx(self, data):
		self.transport.write(data)

	def rx(self, data):
		log.msg('%s %s %s %s -> %s %s %s' % (self.factory.name, self.remote_host.type, self.remote_host.host, self.remote_host.port, self.local_host.host, self.local_host.port, data.encode("base64").replace('\n', '')))

class pluginFactory(protocol.Factory):
	protocol = Echo ### Set protocol to custom protocol class name
	
	def __init__(self, name=None):
		self.name = name or 'HoneyPy'

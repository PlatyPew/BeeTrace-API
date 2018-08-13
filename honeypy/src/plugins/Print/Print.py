# HoneyPy Copyright (C) 2013-2017 foospidy
# https://github.com/foospidy/HoneyPy
# See LICENSE for details

from twisted.internet import protocol, reactor, endpoints
from twisted.python import log
import uuid

### START CUSTOM IMPORTS ###
import logging
from pkipplib import pkipplib

from gevent.server import StreamServer
############################

class Print(protocol.Protocol): ### Set custom protocol class name
	localhost   = None
	remote_host = None
	session		= None
	
	### START CUSTOM VARIABLES ###############################################################
	shareName	="Desktop"#share name
	path		="."#where is directory of sharing
	comment		=""#hmm
	passw		=""
	user		=""
		
	##########################################################################################
	
	# handle events
	def connectionMade(self):
		self.connect()

		### START CUSTOM CODE ####################################################################
		

##########################################################################################

	def dataReceived(self, data):
		dataa = data
		print repr(dataa)
		try:
			print data
			body = dataa.split('\r\n\r\n', 1)[1]
		except IndexError:
			body = dataa	
		request = pkipplib.IPPRequest(body)
		request.parse()
		print request
		request = pkipplib.IPPRequest(operation_id=pkipplib.CUPS_GET_DEFAULT)
		request.operation["attributes-charset"] = ("charset", "utf-8")
		request.operation["attributes-natural-language"] = ("naturalLanguage", "en-us")
		self.tx(request.dump())
		
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
	protocol = Print ### Set protocol to custom protocol class name
	
	def __init__(self, name=None):
		self.name = name or 'HoneyPy'
